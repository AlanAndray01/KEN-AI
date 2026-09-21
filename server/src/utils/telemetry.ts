/** Primitive log fields that JSON.stringify / pino JSON output can round-trip. */
export type TelemetryValue = string | number | boolean | null;

export function telemetry(
  fields: Record<string, TelemetryValue | undefined>,
): Record<string, TelemetryValue> {
  const out: Record<string, TelemetryValue> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) continue;
    out[key] = value;
  }
  return out;
}

export function extraString(extra: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = extra?.[key];
  return typeof value === "string" ? value : undefined;
}
