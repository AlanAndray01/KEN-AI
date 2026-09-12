import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { HomePage } from "./HomePage";

const mockUser = vi.fn<() => { id: string } | null>(() => null);

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: mockUser() }),
}));

// The scene hook drives canvases and loads Three.js from a CDN. jsdom has
// neither a WebGL context nor a network, and none of it affects the markup
// these tests assert on.
vi.mock("./landing/useLandingScenes", () => ({
  useLandingScenes: () => undefined,
}));

function renderHome(): HTMLElement {
  const { container } = render(
    <MemoryRouter>
      <HomePage />
    </MemoryRouter>,
  );
  return container;
}

/** Several strings appear in both the page body and the footer. */
function main(): HTMLElement {
  return screen.getByRole("main");
}

describe("HomePage", () => {
  it("names the product and its promise", () => {
    mockUser.mockReturnValue(null);
    renderHome();

    expect(screen.getByRole("heading", { name: "KEN AI", level: 1 })).toBeInTheDocument();
    expect(within(main()).getByText("Intelligence without the noise.")).toBeInTheDocument();
  });

  it("renders every section of the landing page", () => {
    mockUser.mockReturnValue(null);
    renderHome();

    // One assertion per section, in page order. This is the guard against a
    // future edit quietly dropping a section the way an earlier revision did.
    const body = within(main());
    expect(body.getByText("Introducing Ken AI")).toBeInTheDocument();
    expect(body.getByText("The model")).toBeInTheDocument();
    expect(body.getByText("Model family")).toBeInTheDocument();
    expect(body.getByText("The interface")).toBeInTheDocument();
    expect(body.getByText("Capabilities")).toBeInTheDocument();
    expect(body.getByRole("region", { name: "KEN in action" })).toBeInTheDocument();
    expect(body.getByText("Developers")).toBeInTheDocument();
    expect(body.getByText("Performance")).toBeInTheDocument();
    expect(body.getByText("Privacy & security")).toBeInTheDocument();
    expect(body.getByText("Pricing")).toBeInTheDocument();
    expect(body.getByText("Questions")).toBeInTheDocument();
    expect(body.getByText("The future of thinking")).toBeInTheDocument();
  });

  it("lists the full model family and pricing tiers", () => {
    mockUser.mockReturnValue(null);
    renderHome();

    for (const model of ["Fast", "Reason", "Vision", "Code"]) {
      expect(screen.getByRole("heading", { name: `KEN ${model}` })).toBeInTheDocument();
    }
    for (const plan of ["Free", "Pro", "Team"]) {
      expect(screen.getByRole("heading", { name: plan })).toBeInTheDocument();
    }
    expect(screen.getByText("$20")).toBeInTheDocument();
    expect(screen.getByText("$30")).toBeInTheDocument();
  });

  it("renders all eight capabilities, five story panels, and eight questions", () => {
    mockUser.mockReturnValue(null);
    const container = renderHome();

    expect(container.querySelectorAll(".cap-grid .cap")).toHaveLength(8);
    expect(container.querySelectorAll(".story-track .story-panel")).toHaveLength(5);
    expect(container.querySelectorAll("#faq .faq-item")).toHaveLength(8);
    expect(container.querySelectorAll(".trust-grid .trust")).toHaveLength(6);
    expect(container.querySelectorAll(".api-list .api-item")).toHaveLength(6);
  });

  it("sends a signed-out visitor to sign-up, not straight into the app", () => {
    mockUser.mockReturnValue(null);
    renderHome();

    const ctas = screen.getAllByRole("link", { name: "Start chatting" });
    expect(ctas.length).toBeGreaterThan(0);
    ctas.forEach((cta) => expect(cta).toHaveAttribute("href", "/register"));
    expect(screen.getAllByRole("link", { name: "Sign in" })[0]).toHaveAttribute("href", "/login");
  });

  it("sends a signed-in visitor to the workspace instead", () => {
    mockUser.mockReturnValue({ id: "u1" });
    renderHome();

    const ctas = screen.getAllByRole("link", { name: "Open KEN" });
    expect(ctas.length).toBeGreaterThan(0);
    ctas.forEach((cta) => expect(cta).toHaveAttribute("href", "/chat"));
  });

  it("links the legal pages a visitor has to be able to read before signing up", () => {
    mockUser.mockReturnValue(null);
    renderHome();

    const footer = screen.getByRole("contentinfo");
    expect(within(footer).getByRole("link", { name: "Privacy" })).toHaveAttribute("href", "/privacy");
    expect(within(footer).getByRole("link", { name: "Terms" })).toHaveAttribute("href", "/terms");
  });

  it("paints the KEN AI title in place with no drop animation", () => {
    mockUser.mockReturnValue(null);
    const container = renderHome();

    expect(container.querySelector(".drop-letter")).toBeNull();
    expect(container.querySelector(".impact-line")).toBeNull();
    const heading = screen.getByRole("heading", { name: "KEN AI", level: 1 });
    expect(heading.querySelector(".ken-title")?.textContent?.trim()).toBe("KEN");
    expect(heading.querySelector(".ai-title")?.textContent?.trim()).toBe("AI");
  });
});
