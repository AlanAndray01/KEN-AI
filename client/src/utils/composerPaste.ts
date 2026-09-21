/**
 * Identity for a paste/upload payload. `lastModified` is omitted because
 * Chromium's `DataTransferItem.getAsFile()` often stamps a new timestamp
 * while `clipboard.files` keeps the original, which doubled image chips.
 */
export function fileIdentityKey(file: { name: string; size: number; type: string }): string {
  return `${file.name}:${file.size}:${file.type}`;
}

/**
 * Gives a clipboard payload a stable, human name; it usually has none.
 */
export function namedClipboardFile(file: File): File {
  if (file.name && file.name !== "image.png" && file.name !== "blob") return file;
  const extension = file.type.split("/")[1]?.split("+")[0] ?? "png";
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  return new File([file], `pasted-${stamp}.${extension}`, {
    type: file.type,
    lastModified: file.lastModified,
  });
}

/**
 * Reads both `items` and `files`: Chrome and Firefox populate `files`, while
 * Safari (desktop and iOS) only fills `items`. Entries are de-duplicated
 * because a browser may list the same payload in both.
 */
export function filesFromClipboard(clipboard: DataTransfer): File[] {
  const seen = new Set<string>();
  const files: File[] = [];
  const collect = (file: File | null): void => {
    if (!file || file.size === 0) return;
    const key = fileIdentityKey(file);
    if (seen.has(key)) return;
    seen.add(key);
    files.push(namedClipboardFile(file));
  };

  for (const item of clipboard.items ?? []) {
    if (item.kind === "file") collect(item.getAsFile());
  }
  for (const file of clipboard.files ?? []) collect(file);
  return files;
}
