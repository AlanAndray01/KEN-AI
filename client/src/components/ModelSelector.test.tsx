import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CLOUDFLARE_IMAGE_MODEL_ID, type PublicAIModel } from "@Ken/shared";
import { ModelSelector } from "./ModelSelector";

const models: PublicAIModel[] = [
  {
    id: "qwen/qwen3.6-27b",
    name: "Qwen 3.6 27B",
    providerId: "groq",
    capabilities: ["text", "streaming"],
    capability: "Text & Chat",
    enabled: true,
    available: true,
  },
];

describe("ModelSelector", () => {
  it("keeps the trigger mounted while models are loading", () => {
    render(
      <ModelSelector
        models={[]}
        providerId="groq"
        modelId="qwen/qwen3.6-27b"
        loading
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "Select model" })).toBeInTheDocument();
    expect(screen.queryByText("No model available")).not.toBeInTheDocument();
  });

  it("includes the visible model name in the accessible label", () => {
    render(
      <ModelSelector
        models={models}
        providerId="groq"
        modelId="qwen/qwen3.6-27b"
        onChange={vi.fn()}
      />,
    );

    const trigger = screen.getByRole("button", { name: "Select model: Qwen 3.6 27B" });
    expect(trigger).toHaveTextContent("Qwen 3.6 27B");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(trigger).not.toHaveAttribute("aria-controls");
  });

  it("points the trigger at the open listbox", () => {
    render(
      <ModelSelector
        models={models}
        providerId="groq"
        modelId="qwen/qwen3.6-27b"
        onChange={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Select model: Qwen 3.6 27B" }));

    expect(screen.getByRole("button", { name: "Select model: Qwen 3.6 27B" })).toHaveAttribute(
      "aria-controls",
      "model-selector-listbox",
    );
    expect(screen.getByRole("listbox", { name: "Models" })).toHaveAttribute("id", "model-selector-listbox");
    expect(screen.getByText("Text & Chat")).toBeInTheDocument();
  });
});

describe("ModelSelector Auto mode", () => {
  it("shows Auto as the selection when the picker is on auto", () => {
    render(<ModelSelector models={models} providerId="auto" modelId="auto" onChange={vi.fn()} />);

    const trigger = screen.getByRole("button", { name: "Select model: Auto" });
    expect(trigger).toHaveTextContent("Auto");
  });

  it("offers Auto first and marks it selected", () => {
    render(<ModelSelector models={models} providerId="auto" modelId="auto" onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Select model: Auto" }));

    const options = screen.getAllByRole("option");
    expect(options[0]).toHaveTextContent("Auto");
    expect(options[0]).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("Picks the best available model for each message")).toBeInTheDocument();
  });

  it("reports an explicit model choice as a manual override", () => {
    const onChange = vi.fn();
    render(<ModelSelector models={models} providerId="auto" modelId="auto" onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Select model: Auto" }));
    fireEvent.click(screen.getByRole("option", { name: /Qwen 3.6 27B/ }));

    expect(onChange).toHaveBeenCalledWith("groq", "qwen/qwen3.6-27b");
  });

  it("returns to Auto from a manual selection", () => {
    const onChange = vi.fn();
    render(
      <ModelSelector models={models} providerId="groq" modelId="qwen/qwen3.6-27b" onChange={onChange} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Select model: Qwen 3.6 27B" }));
    fireEvent.click(screen.getByRole("option", { name: /Auto/ }));

    expect(onChange).toHaveBeenCalledWith("auto", "auto");
  });
});

describe("ModelSelector Flux", () => {
  it("lists Flux with the Image Generation badge", () => {
    const flux: PublicAIModel = {
      id: CLOUDFLARE_IMAGE_MODEL_ID,
      name: "Flux 1 Schnell (Cloudflare)",
      providerId: "cloudflare",
      capabilities: ["imageGeneration"],
      capability: "Image Generation",
      enabled: true,
      available: true,
    };
    const onChange = vi.fn();
    render(<ModelSelector models={[...models, flux]} providerId="auto" modelId="auto" onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Select model: Auto" }));

    expect(screen.getByText("Flux 1 Schnell (Cloudflare)")).toBeInTheDocument();
    expect(screen.getByText("Image Generation")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("option", { name: /Flux 1 Schnell/ }));
    expect(onChange).toHaveBeenCalledWith("cloudflare", CLOUDFLARE_IMAGE_MODEL_ID);
  });
});
