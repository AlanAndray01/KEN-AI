const MONGODB_URI_PATTERN = /mongodb(\+srv)?:\/\/[^\s"'`]+/gi;

const MONGODB_SRV_HOST_PATTERN = /_mongodb\._tcp\.[^\s"'`]+/gi;

const MONGODB_ATLAS_HOST_PATTERN = /[a-z0-9][a-z0-9.-]*\.mongodb\.net/gi;

const CREDENTIAL_PATTERN =
  /(api[_-]?key|secret|password|token|authorization|mongodb_uri)(["']?\s*[:=]\s*["']?)([^\s"',]+)/gi;

const BEARER_PATTERN = /Bearer\s+[A-Za-z0-9._-]+/gi;

const OPENAI_KEY_PATTERN = /\bsk-[A-Za-z0-9_-]{8,}\b/g;

const GOOGLE_KEY_PATTERN = /\bAIza[A-Za-z0-9_-]{10,}\b/g;

const JWT_PATTERN = /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9._-]+\b/g;

export function redactSensitive(value: string): string {
  return value
    .replace(MONGODB_URI_PATTERN, "mongodb://[redacted]")
    .replace(MONGODB_SRV_HOST_PATTERN, "_mongodb._tcp.[redacted]")
    .replace(MONGODB_ATLAS_HOST_PATTERN, "[redacted].mongodb.net")
    .replace(BEARER_PATTERN, "Bearer [redacted]")
    .replace(OPENAI_KEY_PATTERN, "[redacted]")
    .replace(GOOGLE_KEY_PATTERN, "[redacted]")
    .replace(JWT_PATTERN, "[redacted]")
    .replace(CREDENTIAL_PATTERN, "$1$2[redacted]");
}

export function toSafeError(error: unknown): Error {
  const message = redactSensitive(error instanceof Error ? error.message : "Unexpected error");
  return new Error(message);
}

export function hasLeakedSecret(value: string): boolean {
  const uris = value.match(/mongodb(\+srv)?:\/\/[^\s"'`]+/gi) ?? [];
  const uriLeak = uris.some(
    (uri) => uri !== "mongodb://[redacted]" && uri !== "mongodb+srv://[redacted]",
  );
  const hostLeak = /(?<!\[redacted\]\.)[a-z0-9][a-z0-9.-]*\.mongodb\.net/i.test(value);
  const srvLeak = /_mongodb\._tcp\.(?!\[redacted\])/i.test(value);
  return uriLeak || hostLeak || srvLeak;
}
