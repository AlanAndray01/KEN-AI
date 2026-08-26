export function isAbortError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const name = "name" in error ? String(error.name) : "";
  return name === "AbortError" || name === "TimeoutError" || name === "AbortSignal.abort";
}

export function isTimeoutAbort(signal: AbortSignal): boolean {
  const reason = signal.reason;
  if (!reason || typeof reason !== "object") return false;
  return "name" in reason && String(reason.name) === "TimeoutError";
}

export function combineAbortSignals(...signals: Array<AbortSignal | undefined>): AbortSignal {
  const active = signals.filter((signal): signal is AbortSignal => Boolean(signal));
  if (active.length === 0) {
    return new AbortController().signal;
  }
  if (active.length === 1) {
    return active[0]!;
  }
  return AbortSignal.any(active);
}
