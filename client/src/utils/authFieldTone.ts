export function emailFieldTone(value: string): "error" | "success" | undefined {
  if (!value.trim()) return undefined;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()) ? "success" : "error";
}

export function filledFieldTone(value: string): "error" | "success" | undefined {
  if (!value) return undefined;
  return value.trim() ? "success" : "error";
}
