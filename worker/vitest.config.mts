import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig({
	plugins: [
		cloudflareTest({
			// Tests supply fake AI/vendor bindings; no account or remote inference is needed.
			remoteBindings: false,
			wrangler: { configPath: "./wrangler.jsonc" },
		}),
	],
});
