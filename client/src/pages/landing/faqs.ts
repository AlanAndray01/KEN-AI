/**
 * The landing page FAQ.
 *
 * Extracted from HomePage so it has one home. Google's FAQPage structured data
 * must match the question and answer text a visitor actually sees — inventing
 * or paraphrasing it in the markup is a guideline violation — so the FAQPage
 * block in `client/index.html` is generated from exactly these strings, and
 * `client/src/seo.test.ts` fails if the two drift apart.
 *
 * The first entry answers "What is Ken AI?" in full brand form on purpose: it
 * is the question a person searching the brand name is actually asking, and it
 * is the one Google is most likely to surface.
 */
export const FAQS = [
  {
    q: "What is Ken AI?",
    a: "Ken AI is an AI assistant and platform, available at ken-ai.tech. You can chat with Ken in the app, upload files and images for it to read, ask it to write or debug code, and call the same models from your own software through the API.",
  },
  {
    q: "How does Ken AI compare to other AI assistants?",
    a: "Ken is built around one workspace rather than a series of disconnected chats. Models, files, memory, and tools stay in the same thread, so switching from a quick answer to deep work does not mean starting over. The honest answer on quality is to try it on your own work.",
  },
  {
    q: "Which models does Ken AI support?",
    a: "Four in the KEN family: Fast for everyday conversation, Reason for complex problems, Vision for images and visual input, and Code for engineering work. You can switch between them mid-conversation from the model selector.",
  },
  {
    q: "Can Ken AI analyze files?",
    a: "Yes. Attach documents, spreadsheets, code, and images, and Ken reads them in context. It can summarise, compare, extract structured data, or answer specific questions against what you uploaded.",
  },
  {
    q: "Can Ken AI write code?",
    a: "KEN Code writes, reviews, and explains code across common languages and frameworks. It can work from an error message, a file you paste in, or a description of what you want to build.",
  },
  {
    q: "Does Ken AI remember conversations?",
    a: "On paid plans Ken can remember context you choose to keep — how you like your code formatted, what you are working on, who your team is. You can review what it remembers and delete any of it at any time.",
  },
  {
    q: "Is Ken AI available through an API?",
    a: "Yes. The API exposes the full model family with streaming, tool calling, and structured outputs, with SDKs for TypeScript, Python, and Go.",
  },
  {
    q: "Is there a free plan?",
    a: "There is. The Free plan includes KEN Fast, file uploads, and history, with a daily message limit. No card required to start.",
  },
] as const;
