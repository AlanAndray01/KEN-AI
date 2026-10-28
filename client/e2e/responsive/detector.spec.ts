import { expect, test } from "@playwright/test";
import { scanLayout } from "./audit";

test("Detects horizontal page overflow and fixed/min width evidence", async ({ page }) => {
  await page.setContent('<style>body{margin:0}#wide{width:480px;min-width:480px;height:20px}</style><div id="wide">Wide</div>');
  const audit = await scanLayout(page, "synthetic fixed width", []);
  expect(audit.issues.some(issue => issue.kind === "page-overflow")).toBe(true);
  expect(audit.widthCandidates.some(issue => issue.selector === "#wide" && issue.width === 480 && issue.declarations?.length)).toBe(true);
});
test("Detects elements escaping a clipped page", async ({ page }) => {
  await page.setContent('<style>html,body{margin:0;overflow-x:clip}#escape{position:fixed;left:300px;width:50px;height:20px}</style><div id="escape">Oops</div>');
  expect((await scanLayout(page, "clipped document", [])).issues.some(issue => issue.selector === "#escape" && issue.right === 350)).toBe(true);
});
test("Allows bounded horizontal scroll content, but catches an overflowing scroll container", async ({ page }) => {
  await page.setContent('<style>body{margin:0}#scroll{width:300px;overflow-x:auto}#inside{width:600px;height:20px}</style><div id="scroll"><div id="inside">Table</div></div>');
  expect((await scanLayout(page, "scrollable table", [])).issues).toEqual([]);
  await page.locator("#scroll").evaluate(node => { node.style.width = "400px"; });
  expect((await scanLayout(page, "oversized scroll container", [])).issues.some(issue => issue.selector === "#scroll")).toBe(true);
});
test("Ignores hidden and screen-reader-only content, retains visible negative-position bugs", async ({ page }) => {
  await page.setContent('<style>body{margin:0}.sr-only{position:absolute;width:1px;height:1px;left:-9999px}#hidden{display:none;width:600px}#negative{position:fixed;left:-25px;width:100px;height:20px}</style><div id="hidden"></div><span class="sr-only">Accessible name</span><div id="negative">Visible</div>');
  const audit = await scanLayout(page, "negative position", []);
  expect(audit.issues.map(issue => issue.selector)).toEqual(["#negative"]);
});
