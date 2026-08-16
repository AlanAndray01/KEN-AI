import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "@aether/shared": path.resolve(__dirname, "../shared/src/index.ts"),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
  preview: {
    port: 4173,
  },
  build: {
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
            id.includes("unified") ||
            id.includes("mdast") ||
            id.includes("hast") ||
            id.includes("micromark") ||
            id.includes("unist")
          ) {
            return "markdown";
          }
          if (id.includes("@tanstack")) return "react";
          if (id.includes("lucide-react")) return "icons";
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
