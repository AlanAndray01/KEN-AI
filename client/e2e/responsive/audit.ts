import { expect, type Page, type TestInfo } from "@playwright/test";

export interface LayoutIssue {
  kind: "page-overflow" | "element-outside-viewport" | "image-card-excess-width" | "image-distortion";
  selector: string;
  width: number;
  left: number;
  right: number;
  viewportWidth: number;
  minWidth?: string;
  declarations?: string[];
  detail: string;
}
export interface LayoutAudit {
  url: string;
  scenario: string;
  viewport: { width: number; height: number };
  documentWidth: number;
  issues: LayoutIssue[];
  widthCandidates: LayoutIssue[];
  exclusions: { selector: string; reason: string }[];
  sourceHints: string[];
}

export async function scanLayout(page: Page, scenario: string, sourceHints: string[]): Promise<LayoutAudit> {
  const viewport = page.viewportSize();
  if (!viewport) throw new Error("Responsive audit requires an explicit viewport.");
  const measurement = await page.evaluate(() => {
    const tolerance = 1.5;
    const viewportWidth = document.documentElement.clientWidth;
    const round = (value: number) => Math.round(value * 100) / 100;
    const selector = (node: Element): string => {
      if (node.id) return `#${CSS.escape(node.id)}`;
      const parts: string[] = [];
      let current: Element | null = node;
      while (current && parts.length < 6) {
        if (current.id) { parts.unshift(`#${CSS.escape(current.id)}`); break; }
        const siblings = current.parentElement ? [...current.parentElement.children].filter(s => s.tagName === current!.tagName) : [];
        parts.unshift(current.localName + (siblings.length > 1 ? `:nth-of-type(${siblings.indexOf(current) + 1})` : ""));
        current = current.parentElement;
      }
      return parts.join(" > ");
    };
    const rules: CSSStyleRule[] = [];
    function collectRules(list: CSSRuleList): void {
      for (const rule of list) {
        if (rule instanceof CSSStyleRule) rules.push(rule);
        // @media, @supports, @layer and nested rules; inactive media are skipped.
        if (rule instanceof CSSMediaRule && !matchMedia(rule.conditionText).matches) continue;
        if (rule instanceof CSSSupportsRule && !CSS.supports(rule.conditionText)) continue;
        if ("cssRules" in rule) collectRules((rule as CSSGroupingRule).cssRules);
      }
    }
    for (const sheet of document.styleSheets) { try { collectRules(sheet.cssRules); } catch { /* cross-origin stylesheet */ } }
    function declarations(node: Element): string[] {
      const result: string[] = [];
      if (node instanceof HTMLElement && (node.style.width || node.style.minWidth)) result.push(`inline: width=${node.style.width || "unset"}; min-width=${node.style.minWidth || "unset"}`);
      for (const rule of rules) {
        if (!rule.style.width && !rule.style.minWidth) continue;
        try {
          if (node.matches(rule.selectorText)) result.push(`${rule.selectorText}: width=${rule.style.width || "unset"}; min-width=${rule.style.minWidth || "unset"}`);
        } catch { /* pseudo-element and unsupported selector */ }
      }
      return result;
    }
    function explicitHorizontalScroll(node: Element): boolean {
      if (node instanceof HTMLElement && [node.style.overflowX, node.style.overflow].some(value => /^(auto|scroll)$/.test(value))) return true;
      return rules.some(rule => {
        if (![rule.style.overflowX, rule.style.overflow].some(value => /^(auto|scroll)$/.test(value))) return false;
        try { return node.matches(rule.selectorText); } catch { return false; }
      });
    }
    const issues: LayoutIssue[] = [];
    const exclusions: { selector: string; reason: string }[] = [];
    const documentWidth = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth);
    if (documentWidth > viewportWidth + tolerance) issues.push({ kind: "page-overflow", selector: "html / body", width: documentWidth,
      left: 0, right: documentWidth, viewportWidth, detail: `Document exceeds viewport by ${round(documentWidth - viewportWidth)}px.` });
    for (const node of document.body.querySelectorAll("*")) {
      if (!(node instanceof HTMLElement || node instanceof SVGSVGElement)) continue;
      const rect = node.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0 || (rect.left >= -tolerance && rect.right <= viewportWidth + tolerance)) continue;
      let exclusion = "";
      for (let ancestor: Element | null = node; ancestor; ancestor = ancestor.parentElement) {
        const style = getComputedStyle(ancestor);
        if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0 || ancestor.hasAttribute("inert")) {
          exclusion = "Not rendered (hidden, transparent, or inert subtree)."; break;
        }
        if (ancestor.matches(".sr-only")) { exclusion = "Screen-reader-only content."; break; }
        if (ancestor.matches(".auth-grain")) { exclusion = "Intentional noninteractive grain background clipped by the auth shell."; break; }
        if (ancestor.matches('aside[aria-label="Workspace"]') && ancestor.getBoundingClientRect().right <= tolerance &&
          (style.transform !== "none" || style.translate !== "none")) {
          exclusion = "Closed off-canvas mobile sidebar; open state is tested separately."; break;
        }
        if (ancestor !== node && explicitHorizontalScroll(ancestor)) {
          const scrollRect = ancestor.getBoundingClientRect();
          if (["auto", "scroll"].includes(style.overflowX) && scrollRect.left >= -tolerance && scrollRect.right <= viewportWidth + tolerance) {
            exclusion = "Content within a bounded, intentionally horizontal scroll container."; break;
          }
        }
        // Desktop landing story panels intentionally translate through a clipped stage.
        // Only fully offscreen panels are exempt; a visible panel can still fail.
        if (ancestor.matches("#story-track > article")) {
          const panelRect = ancestor.getBoundingClientRect();
          const stage = ancestor.closest(".story-sticky");
          if (stage && ["hidden", "clip"].includes(getComputedStyle(stage).overflowX) &&
            (panelRect.left >= viewportWidth - tolerance || panelRect.right <= tolerance)) {
            exclusion = "Inactive landing story panel outside its clipped animation stage."; break;
          }
        }
      }
      if (exclusion) { exclusions.push({ selector: selector(node), reason: exclusion }); continue; }
      const style = getComputedStyle(node);
      issues.push({ kind: "element-outside-viewport", selector: selector(node), width: round(rect.width), left: round(rect.left), right: round(rect.right),
        viewportWidth, minWidth: style.minWidth, declarations: declarations(node),
        detail: `Element extends ${round(Math.max(0, -rect.left))}px left and ${round(Math.max(0, rect.right - viewportWidth))}px right of the viewport.` });
    }
    return { documentWidth, issues, exclusions, widthCandidates: issues.filter(issue => issue.kind === "element-outside-viewport" &&
      (parseFloat(issue.minWidth || "0") > 0 || issue.declarations?.some(rule => /(?:width|min-width)=(?:[\d.]+(?:px|rem|em)|min-content|max-content|calc\(|min\()/i.test(rule)))) };
  });
  return { url: page.url(), scenario, viewport, ...measurement, sourceHints };
}

/** Contract for a single image-only reply: no stretched pixels or oversized empty card. */
export async function scanSquareImage(page: Page): Promise<LayoutIssue[]> {
  return page.locator('.assistant-turn img[alt="responsive-square.svg"]').evaluate((image: HTMLImageElement) => {
    const card = image.closest(".assistant-turn")!;
    const imageRect = image.getBoundingClientRect();
    const cardRect = card.getBoundingClientRect();
    const style = getComputedStyle(card);
    const imageStyle = getComputedStyle(image);
    const naturalRatio = image.naturalWidth / image.naturalHeight;
    const fittedWidth = imageStyle.objectFit === "contain" ? Math.min(imageRect.width, imageRect.height * naturalRatio) : imageRect.width;
    const allowedWidth = fittedWidth + parseFloat(style.paddingLeft) + parseFloat(style.paddingRight) + parseFloat(style.borderLeftWidth) + parseFloat(style.borderRightWidth);
    const round = (n: number) => Math.round(n * 100) / 100;
    const issues: LayoutIssue[] = [];
    const metrics = { width: round(cardRect.width), left: round(cardRect.left), right: round(cardRect.right), viewportWidth: document.documentElement.clientWidth };
    if (cardRect.width - allowedWidth > 8) issues.push({ kind: "image-card-excess-width", selector: ".assistant-turn:has(img[alt=\"responsive-square.svg\"])", ...metrics,
      detail: `Square image paints ${round(fittedWidth)}px wide (${image.naturalWidth}x${image.naturalHeight} natural); image-only card is ${round(cardRect.width)}px wide, ${round(cardRect.width - allowedWidth)}px wider than image plus card padding/borders.` });
    if (!["contain", "cover", "scale-down"].includes(imageStyle.objectFit) && Math.abs(imageRect.width / imageRect.height - naturalRatio) > 0.02)
      issues.push({ kind: "image-distortion", selector: '.assistant-turn img[alt="responsive-square.svg"]', width: round(imageRect.width), left: round(imageRect.left), right: round(imageRect.right), viewportWidth: metrics.viewportWidth, detail: "Rendered image aspect ratio differs from its natural aspect ratio without object-fit protection." });
    return issues;
  });
}

export async function assertLayout(page: Page, testInfo: TestInfo, audit: LayoutAudit): Promise<void> {
  await testInfo.attach("layout-audit.json", { body: JSON.stringify(audit, null, 2), contentType: "application/json" });
  if (audit.issues.length) {
    // Capture immediately, including full public pages; Playwright also captures the viewport on failure.
    await testInfo.attach("layout-full-page", { body: await page.screenshot({ fullPage: true, animations: "disabled" }), contentType: "image/png" });
  }
  const lines = audit.issues.slice(0, 15).map(issue => `  ${issue.kind}: ${issue.selector}\n    width=${issue.width}px left=${issue.left}px right=${issue.right}px viewport=${issue.viewportWidth}px\n    ${issue.detail}${issue.declarations?.length ? `\n    Width rules: ${issue.declarations.join(" | ")}` : ""}`);
  if (audit.issues.length > 15) lines.push(`  ${audit.issues.length - 15} more findings in layout-audit.json and the Markdown/HTML report.`);
  expect(audit.issues.length, `Responsive layout failure\nURL: ${audit.url}\nViewport: ${audit.viewport.width}x${audit.viewport.height}\nScenario: ${audit.scenario}\nSource candidates: ${audit.sourceHints.join(", ")}\n${lines.join("\n")}`).toBe(0);
}
