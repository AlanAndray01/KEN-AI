import { readFileSync, writeFileSync } from 'node:fs';
const path = 'server/src/services/ai/catalog.ts';
let s = readFileSync(path, 'utf8').replaceAll('\r\n', '\n');
const start = s.indexOf('/**\n * The rest of the Workers AI');
const end = s.indexOf('\nexport const BUILT_IN_PROVIDERS', start);
const extra = s.slice(start, end).replaceAll('ProviderModelDescriptor[]', 'CloudflareModelDescriptor[]');
const ms = s.indexOf('    models: [', s.indexOf('    providerId: "cloudflare"'));
const me = s.indexOf('\n    ],', ms) + '\n    ]'.length;
const models = s.slice(ms, me).replace('    models: [', 'export const CLOUDFLARE_MODELS: CloudflareModelDescriptor[] = [')
  .replace('Last-resort fallback once every other provider has failed.', 'Manual quality tier.')
  .replace('Smaller and faster than the 70B fallback above; tried after it.', 'Cheap default Cloudflare fallback tier.') + ';\n';
const header = `// Shared by Express and the Worker so chat/image allowlists cannot drift.
import type { ModelCapability } from "../types/domain.js";
import { CLOUDFLARE_IMAGE_MODEL_ID, CLOUDFLARE_QUALITY_MODEL_ID,
  CLOUDFLARE_VISION_MODEL_ID, DEFAULT_CLOUDFLARE_MODEL_ID } from "./index.js";

export interface CloudflareModelDescriptor {
  id: string;
  name: string;
  description?: string;
  capabilities: ModelCapability[];
  contextWindow?: number;
}
const TEXT_STREAM: ModelCapability[] = ["text", "streaming"];
const TEXT_STREAM_TOOLS: ModelCapability[] = ["text", "streaming", "tools"];
// Quarantined after repeated model-side failures; remove only after a live check.
export const CLOUDFLARE_DISABLED_MODEL_IDS: readonly string[] = ["@cf/qwen/qwen3.8-27b"];

`;
if (start < 0 || end < 0 || ms < 0 || me < ms) throw new Error('Catalog layout changed');
writeFileSync('shared/src/constants/cloudflareModels.ts', header + extra + '\n' + models);
s = s.slice(0, ms) + '    models: CLOUDFLARE_MODELS.filter((model) => !CLOUDFLARE_DISABLED_MODEL_IDS.includes(model.id))' + s.slice(me);
s = s.slice(0, start) + s.slice(end);
for (const name of ['CLOUDFLARE_IMAGE_MODEL_ID', 'CLOUDFLARE_QUALITY_MODEL_ID', 'CLOUDFLARE_VISION_MODEL_ID', 'DEFAULT_CLOUDFLARE_MODEL_ID']) s = s.replace('  ' + name + ',\n', '');
s = s.replace('import type { ProviderModelDescriptor }', 'import { CLOUDFLARE_MODELS, CLOUDFLARE_DISABLED_MODEL_IDS } from "@Ken/shared";\nimport type { ProviderModelDescriptor }');
writeFileSync(path, s);
writeFileSync('shared/src/index.ts', readFileSync('shared/src/index.ts', 'utf8') + '\nexport { CLOUDFLARE_MODELS, CLOUDFLARE_DISABLED_MODEL_IDS } from "./constants/cloudflareModels.js";\n');
