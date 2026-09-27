/**
 * Providers whose request format carries a PDF itself: Gemini as an
 * `inlineData` part, OpenAI as a `file` content block. Every other provider
 * only ever sees a PDF as extracted text.
 */
export function providerReadsPdfNatively(providerId: string): boolean {
  return providerId === "gemini" || providerId === "openai";
}
