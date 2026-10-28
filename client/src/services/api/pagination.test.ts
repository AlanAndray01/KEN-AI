import { afterEach, expect, it, vi } from "vitest";
import { collectPages } from "./pagination";
afterEach(() => vi.unstubAllGlobals());
it("follows cursors to reach older items without dropping pages", async () => {
  const fetch = vi.fn().mockResolvedValueOnce(Response.json({ files: Array.from({ length: 100 }, (_, id) => ({ id })), nextCursor: "next" }))
    .mockResolvedValueOnce(Response.json({ files: [{ id: 100 }], nextCursor: undefined }));
  vi.stubGlobal("fetch", fetch);
  const files = await collectPages<{ id: number }>("/files", "files");
  expect(files).toHaveLength(101);
  expect(files.at(-1)?.id).toBe(100);
  expect(String(fetch.mock.calls[1]?.[0])).toContain("cursor=next");
});
it("stops a malformed server from causing an endless cursor loop", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ files: [], nextCursor: "same" })));
  await expect(collectPages("/files", "files")).rejects.toThrow(/did not advance/);
});
