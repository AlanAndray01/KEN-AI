import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

export default defineConfig(({ command, mode }) => {
  const viteEnv = loadEnv(mode, __dirname, "VITE_");
  if (command === "build" && (process.env.VERCEL || process.env.CI)) {
    const apiUrl = viteEnv.VITE_API_BASE_URL || viteEnv.VITE_API_URL;
    if (!apiUrl) {
      throw new Error(
        "Set VITE_API_BASE_URL or VITE_API_URL for a Vercel/CI client build (example: https://api.ken-ai.tech/api).",
      );
    }
    if (/localhost|127\.0\.0\.1/i.test(apiUrl)) {
      throw new Error("VITE_API_BASE_URL must not point at localhost on Vercel/CI.");
    }
  }

  return {
  plugins: [
    react(),
    tailwindcss(),
    {
      name: "katex-font-display-swap",
      transform(code, id) {
        const moduleId = id.replaceAll("\\", "/");
        if (!moduleId.includes("/katex/dist/katex.min.css")) return;
        return {
          code: code.replaceAll("font-display:block", "font-display:swap"),
          map: null,
        };
      },
    },
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "@Ken/shared": path.resolve(__dirname, "../shared/src/index.ts"),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    warmup: {
      clientFiles: [
        "./src/pages/ChatPage.tsx",
        "./src/layouts/WorkspaceLayout.tsx",
        "./src/components/ChatComposer.tsx",
        "./src/components/ChatTurn.tsx",
      ],
    },
  },
  preview: {
    port: 4173,
  },
  build: {
    target: "es2022",
    modulePreload: { polyfill: false },
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Vite reports module ids with `/` even on Windows. Matching
          // `path.sep` here split `react` and `katex` into more than one chunk.
          const moduleId = id.replaceAll("\\", "/");
          if (!moduleId.includes("/node_modules/")) return;
          if (
            /\/react-dom(?:\/|$)/.test(moduleId) ||
            /\/node_modules\/react(?:\/|$)/.test(moduleId) ||
            moduleId.includes("/react-router") ||
            /\/scheduler(?:\/|$)/.test(moduleId) ||
            moduleId.includes("/@tanstack/")
          ) {
            return "react";
          }
          if (
            moduleId.includes("highlight.js") ||
            moduleId.includes("react-markdown") ||
            moduleId.includes("/rehype") ||
            moduleId.includes("/remark") ||
            moduleId.includes("/katex") ||
            moduleId.includes("/unified") ||
            moduleId.includes("/mdast") ||
            moduleId.includes("/hast") ||
            moduleId.includes("/micromark") ||
            moduleId.includes("/unist") ||
            moduleId.includes("/vfile") ||
            moduleId.includes("character-entities") ||
            moduleId.includes("comma-separated-tokens") ||
            moduleId.includes("space-separated-tokens") ||
            moduleId.includes("property-information")
          ) {
            return "markdown";
          }
          if (moduleId.includes("zustand") || moduleId.includes("clsx") || moduleId.includes("tailwind-merge")) {
            return "vendor";
          }
          return;
        },
      },
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
};
});
