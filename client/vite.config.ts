import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react(), tailwindcss()],
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
          if (!id.includes("node_modules")) return;
          if (
            id.includes("react-dom") ||
            id.includes(`${path.sep}react${path.sep}`) ||
            id.includes("react-router") ||
            id.includes("scheduler")
          ) {
            return "react";
          }
          if (
            id.includes("highlight.js") ||
            id.includes("react-markdown") ||
            id.includes("rehype") ||
            id.includes("remark") ||
            id.includes("katex") ||
            id.includes("unified") ||
            id.includes("mdast") ||
            id.includes("hast") ||
            id.includes("micromark") ||
            id.includes("unist") ||
            id.includes("vfile") ||
            id.includes("character-entities") ||
            id.includes("comma-separated-tokens") ||
            id.includes("space-separated-tokens") ||
            id.includes("property-information")
          ) {
            return "markdown";
          }
          if (id.includes("@tanstack")) return "react";
          if (id.includes("zustand") || id.includes("clsx") || id.includes("tailwind-merge")) {
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
});
