const cursors = new Map<string, number>();

export function parseKeyPool(...values: Array<string | undefined>): string[] {
  const keys: string[] = [];
  for (const value of values) {
    if (!value) continue;
    for (const part of value.split(",")) {
      const trimmed = part.trim();
      if (trimmed) keys.push(trimmed);
    }
  }
  return [...new Set(keys)];
}

export function nextPoolKey(providerId: string, keys: string[]): string | undefined {
  if (keys.length === 0) return undefined;
  const index = cursors.get(providerId) ?? 0;
  const key = keys[index % keys.length];
  cursors.set(providerId, index + 1);
  return key;
}

export function resetKeyPools(): void {
  cursors.clear();
}
