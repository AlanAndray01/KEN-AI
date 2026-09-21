import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "@/services/api";
import { resetChatImageCache } from "@/utils/chatImageCache";
import { ChatImage, downloadFileName } from "./ChatImage";

beforeAll(() => {
  if (typeof URL.createObjectURL !== "function") {
    URL.createObjectURL = () => "blob:http://localhost/test";
  }
  if (typeof URL.revokeObjectURL !== "function") {
    URL.revokeObjectURL = () => undefined;
  }
});

vi.mock("@/services/api", () => ({
  api: {
    files: {
      content: vi.fn(async () => new Blob([new Uint8Array([0xff, 0xd8, 0xff])], { type: "image/jpeg" })),
    },
  },
}));

vi.mock("@/stores/toastStore", () => ({
  toast: vi.fn(),
}));

beforeEach(() => {
  resetChatImageCache();
  vi.mocked(api.files.content).mockClear();
});

describe("downloadFileName", () => {
  it("keeps a real image filename and defaults Flux bytes to ken-ai-image.jpg", () => {
    expect(downloadFileName("Ken-image.jpg", "image/jpeg")).toBe("Ken-image.jpg");
    expect(downloadFileName("photo", "image/jpeg")).toBe("ken-ai-image.jpg");
    expect(downloadFileName("photo", "image/png")).toBe("ken-ai-image.png");
  });
});

describe("ChatImage", () => {
  it("opens a lightbox and offers download, copy, and edit", async () => {
    const onRemix = vi.fn();
    render(
      <ChatImage
        item={{
          id: "file1",
          originalName: "Ken-image.jpg",
          mimeType: "image/jpeg",
          kind: "image",
        }}
        layout="generated"
        remixPrompt="draw a dinosaur"
        onRemix={onRemix}
      />,
    );

    const view = await screen.findByRole("button", { name: "View Ken-image.jpg" });
    fireEvent.click(view);
    expect(screen.getByRole("dialog", { name: "Ken-image.jpg" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Edit prompt" }));
    expect(onRemix).toHaveBeenCalledWith("draw a dinosaur");
  });

  it("hides Edit when there is no remix prompt", async () => {
    render(
      <ChatImage
        item={{
          id: "file1",
          originalName: "upload.png",
          mimeType: "image/png",
          kind: "image",
        }}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "View upload.png" })).toBeInTheDocument();
    });
    expect(screen.queryByRole("button", { name: "Edit prompt" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Download" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy image" })).toBeInTheDocument();
  });

  it("reuses a decoded blob across remounts instead of refetching the JPEG", async () => {
    const item = {
      id: "file1",
      originalName: "Ken-image.jpg",
      mimeType: "image/jpeg",
      kind: "image" as const,
    };
    const first = render(<ChatImage item={item} />);
    await screen.findByRole("button", { name: "View Ken-image.jpg" });
    expect(api.files.content).toHaveBeenCalledTimes(1);
    first.unmount();

    render(<ChatImage item={item} />);
    await screen.findByRole("button", { name: "View Ken-image.jpg" });
    expect(api.files.content).toHaveBeenCalledTimes(1);
  });
});
