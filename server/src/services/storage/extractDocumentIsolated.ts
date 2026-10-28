import { Worker } from "node:worker_threads";
import { MAX_UPLOAD_BYTES } from "@Ken/shared";
import { AppError } from "../../utils/AppError.js";
import { extractDocumentText, isDocxMime, isPdfMime } from "./extractDocument.js";

let active = 0;
const bootstrap = `
const { parentPort, workerData } = require('node:worker_threads');
(async () => {
  try {
    const mod = workerData.module.endsWith('.ts')
      ? await (await import('tsx/esm/api')).tsImport(workerData.module, workerData.module)
      : await import(workerData.module);
    const text = mod.extractDocumentText(Buffer.from(workerData.bytes), workerData.mime);
    parentPort.postMessage({ text });
  } catch (error) { parentPort.postMessage({ error: error.code === 'DOCUMENT_PROCESSING_LIMIT' ? error.code : 'DOCUMENT_PROCESSING_FAILED' }); }
})();`;

/** Bound HTTP-thread work, concurrent parsers, worker memory, and wall time.
 * Expanded-byte limits are enforced by the parser inside each worker. */
export async function extractDocumentTextIsolated(buffer: Buffer, mimeType: string): Promise<string> {
  if (buffer.length > MAX_UPLOAD_BYTES) throw new AppError("Document is too large", { statusCode: 413, code: "DOCUMENT_PROCESSING_LIMIT" });
  if (!isPdfMime(mimeType) && !isDocxMime(mimeType)) return extractDocumentText(buffer, mimeType);
  if (active >= 2) throw new AppError("Document processing is busy. Please retry shortly.", { statusCode: 503, code: "DOCUMENT_PROCESSOR_BUSY" });
  active += 1;
  let worker: Worker | undefined;
  try {
    const module = new URL(import.meta.url.endsWith(".ts") ? "./extractDocument.ts" : "./extractDocument.js", import.meta.url).href;
    worker = new Worker(bootstrap, { eval: true, execArgv: [], workerData: { module, bytes: buffer, mime: mimeType },
      resourceLimits: { maxOldGenerationSizeMb: 96, maxYoungGenerationSizeMb: 16, stackSizeMb: 4 } });
    return await new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => reject(new AppError("Document processing exceeded its time limit.",
        { statusCode: 413, code: "DOCUMENT_PROCESSING_LIMIT" })), 5_000);
      const fail = () => reject(new AppError("Document could not be processed safely.", { statusCode: 422, code: "DOCUMENT_PROCESSING_FAILED" }));
      worker!.once("error", () => { clearTimeout(timer); fail(); });
      worker!.once("exit", () => { clearTimeout(timer); fail(); });
      worker!.once("message", (result: { text?: string; error?: string }) => {
        clearTimeout(timer);
        if (result.error) reject(new AppError("Document exceeds the processing limits or is invalid.",
          { statusCode: result.error === "DOCUMENT_PROCESSING_LIMIT" ? 413 : 422, code: result.error }));
        else resolve(result.text ?? "");
      });
    });
  } finally { await worker?.terminate(); active -= 1; }
}
