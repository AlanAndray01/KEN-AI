import { afterEach, describe, expect, it } from "vitest";
import { hideBootLoader } from "./bootLoader";

afterEach(() => {
  document.getElementById("boot-loader")?.remove();
});

describe("hideBootLoader", () => {
  it("removes the overlay immediately in instant mode", () => {
    document.body.innerHTML = `<div id="boot-loader"></div>`;
    hideBootLoader("instant");
    expect(document.getElementById("boot-loader")).toBeNull();
  });

  it("fades then removes on the landing path", () => {
    document.body.innerHTML = `<div id="boot-loader"></div>`;
    hideBootLoader("fade");
    const node = document.getElementById("boot-loader");
    expect(node).not.toBeNull();
    expect(node?.classList.contains("boot-done")).toBe(true);
    expect(node?.dataset.state).toBe("done");
  });
});
