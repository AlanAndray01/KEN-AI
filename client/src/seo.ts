export const PUBLIC_METADATA: Record<string, { title: string; description: string }> = {
  "/": { title: "Ken AI | Intelligence Without The Noise", description: "Ken AI is a private AI assistant for thinking, writing, coding, and research. Get clear answers with worked examples." },
  "/privacy": { title: "Privacy policy · Ken AI", description: "Read how Ken AI stores account data, conversations and uploads, shares requests with providers, and handles deletion." },
  "/terms": { title: "Terms of service · Ken AI", description: "Read the terms for using Ken AI, including account responsibilities, acceptable use, and the limits of AI-generated answers." },
  "/login": { title: "Sign in · Ken AI", description: "Sign in to Ken AI to continue your conversations and access your saved files and settings." },
  "/register": { title: "Create account · Ken AI", description: "Create your Ken AI account to start chatting, upload files, and save your conversation history." },
};

export function metadataForPath(pathname: string) {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  const metadata = PUBLIC_METADATA[path];
  return { title: metadata?.title ?? "Ken AI", description: metadata?.description ?? "Your private Ken AI workspace.",
    canonical: new URL(metadata ? path : "/", "https://ken-ai.tech").toString(),
    robots: metadata ? "index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1" : "noindex, nofollow" };
}
