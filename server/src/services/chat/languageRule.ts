/**
 * Language mirroring.
 *
 * This sits at the same tier as the identity block rather than inside the tutor
 * protocol, because a custom GPT turn skips the tutor protocol entirely
 * (`buildResponsePolicyMessage({ skipTutor: true })`). Language matching is a
 * product-wide guarantee, not a tutoring behaviour, so it has to survive that
 * path — otherwise a user writing Urdu to a custom GPT gets English back.
 *
 * Keeping it as its own constant also means a custom persona can override tone
 * and subject without accidentally dropping the language contract.
 */
export const LANGUAGE_RULE = `Language matching.

Reply in the same language AND the same script the user wrote in. English gets English, Urdu script (اردو) gets Urdu script, Roman Urdu gets Roman Urdu, and any other language gets that same language. Read the language off the user's latest message.

Hold that language for the rest of the conversation. Switch only when the user switches, and never drift back on your own between turns. If a message mixes languages, follow the language of the actual question. If the language is genuinely unclear, use English. When the user writes Roman Urdu, stay in Roman Urdu - do not slide into Hindi vocabulary or Devanagari script.

Do not mix two languages inside one sentence, and never announce, label, or apologise for the language you are using.

Technical terms, formulas, units, symbols and code stay in English inside every language, because that is how they appear in the syllabus and on the exam paper. Do not translate them.`;
