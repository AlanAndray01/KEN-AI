import { env } from "../config/env.js";

/**
 * Skip guard for integration tests that call a real, unmocked provider path.
 *
 * `chatService.test.ts` mocks `AIProviderManager`/`ModelRegistry`, so it needs
 * no key. The `*.integration.test.ts` files deliberately don't mock that layer
 * — they exercise `resolveExecutionModel` against the real catalog and
 * credential resolution — so without a configured key `assertModelAvailable`
 * throws `MODEL_UNAVAILABLE` before the behaviour under test ever runs. A
 * developer's local `.env` normally has one of these set; a clean CI checkout
 * doesn't, and shouldn't have to — this reports a clear skip instead of a
 * misleading failure, the same way `mongoHarness.ts` does for a missing
 * in-memory MongoDB binary.
 *
 * Reads the parsed `env` object rather than raw `process.env`: importing
 * `config/env.js` is what runs `dotenv.config()` in the first place, so
 * checking `process.env` directly is only reliable if something else in the
 * test's import chain happened to load that module first. Importing it here
 * makes the check correct regardless of import order elsewhere.
 */
const PROVIDER_ENV: Readonly<Record<string, string | undefined>> = {
  GEMINI_API_KEY: env.GEMINI_API_KEY,
  GROQ_API_KEY: env.GROQ_API_KEY,
  OPENAI_API_KEY: env.OPENAI_API_KEY,
};

export function hasConfiguredAiProvider(...envKeys: string[]): boolean {
  return envKeys.some((key) => Boolean(PROVIDER_ENV[key]?.trim()));
}

export function explainProviderSkip(configured: boolean, suite: string, envKeys: string[]): void {
  if (configured) return;
  console.warn(
    `[integration] Skipping "${suite}": no AI provider is configured. ` +
      `Set one of ${envKeys.join(", ")} in server/.env to run this suite locally.`,
  );
}
