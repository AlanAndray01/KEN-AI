import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { Toaster } from "./Toaster";
import { toast, useToastStore } from "@/stores/toastStore";

describe("Toaster", () => {
  beforeEach(() => {
    useToastStore.setState({ toasts: [] });
  });

  it("shows an error toast", () => {
    toast("No AI provider configured.", "error");
    render(<Toaster />);
    expect(screen.getByRole("alert")).toHaveTextContent("No AI provider configured.");
  });
});
