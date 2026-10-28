// HISTORICAL: asserts pre-fix behavior, requires the audited working tree.
// Current regression checks and implementation status: FIXES.md.
// Offline audit probes: no database, provider, or object-storage calls.
// Run from the repository root: node --import tsx docs/audits/2026-10-12/reproduce.mts
import assert from "node:assert/strict";
import { deflateRawSync } from "node:zlib";
import path from "node:path";
import { fileURLToPath } from "node:url";

Object.assign(process.env, {
  NODE_ENV: "test", LOG_LEVEL: "silent", DOTENV_CONFIG_QUIET: "true",
  JWT_SECRET: "offline-audit-only-not-a-deployment-secret",
  REDIS_URL: "", STORAGE_PROVIDER: "local",
  CLOUDFLARE_WORKER_URL: "", KEN_API_KEY: "",
});
globalThis.fetch = async () => { throw new Error("Network forbidden in offline audit"); };

const { S3CompatibleStorage } = await import("../../../server/src/services/storage/S3CompatibleStorage.ts");
const options = { provider: "s3" as const, bucket: "audit-bucket", accessKey: "fake-access", secretKey: "fake-secret", region: "us-east-1" };
let captured: { url: string; headers: Headers } | undefined;
globalThis.fetch = async (input, init) => {
  captured = { url: String(input), headers: new Headers(init?.headers) };
  return new Response("Access denied", { status: 403 });
};
await new S3CompatibleStorage(options).delete("fake-user/fake-file");
assert.ok(captured);
assert.notEqual(new URL(captured.url).host, captured.headers.get("host"));
console.log("CONFIRMED S3_HOST: default request URL host differs from signed Host.");
console.log("CONFIRMED S3_DELETE: HTTP 403 resolves successfully from delete().");

globalThis.fetch = async () => { throw new Error("Network forbidden in offline audit"); };
const { ContextManager, estimateContextTokens, providerInputTokens } = await import("../../../server/src/services/chat/ContextManager.ts");
const context = new ContextManager().build({
  messages: [{ role: "user", content: "hello ".repeat(20_000) }],
  modelId: "audit-model", providerId: "groq", contextWindow: 128_000,
});
const tokens = estimateContextTokens(context);
assert.ok(tokens > providerInputTokens("groq"));
console.log(`CONFIRMED CONTEXT: ${tokens} estimated tokens admitted with a ${providerInputTokens("groq")} token budget.`);

const { extractDocxText } = await import("../../../server/src/services/storage/extractDocument.ts");
const { validateUploadBuffer } = await import("../../../server/src/services/storage/validateUpload.ts");
const name = Buffer.from("word/document.xml");
// Deliberately bounded to 2 MiB, enough to demonstrate expansion without a stress test.
const xml = Buffer.from(`<w:document><w:p><w:t>${"a".repeat(2 * 1024 * 1024)}</w:t></w:p></w:document>`);
const compressed = deflateRawSync(xml);
const header = Buffer.alloc(30);
header.writeUInt32LE(0x04034b50, 0);
header.writeUInt16LE(8, 8);
header.writeUInt32LE(compressed.length, 18);
header.writeUInt32LE(xml.length, 22);
header.writeUInt16LE(name.length, 26);
const docx = Buffer.concat([header, name, compressed]);
const accepted = validateUploadBuffer({ originalName: "audit.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", buffer: docx });
assert.ok(extractDocxText(docx).length >= 100_000);
console.log(`CONFIRMED DECOMPRESSION: accepted ${docx.length} compressed bytes expand to ${xml.length} bytes before text clipping (${accepted.kind}).`);
const fakePng = validateUploadBuffer({ originalName: "audit.png", mimeType: "image/png", buffer: Buffer.from("not an image") });
assert.equal(fakePng.mimeType, "image/png");
console.log("CONFIRMED UPLOAD_MAGIC: non-image bytes named .png pass image validation.");

const { ExternalAnalysisRunner, resetAnalysisJobsForTests } = await import("../../../server/src/services/analysis/ExternalAnalysisRunner.ts");
globalThis.fetch = async () => Response.json({ status: "completed", output: "2" });
const runner = new ExternalAnalysisRunner("https://offline.invalid");
const submitted = await runner.submit({ userId: "fake-user", language: "python", code: "print(1+1)" });
const job = await runner.get("fake-user", submitted.id);
assert.equal(job.status, "queued");
assert.equal((job as { output?: unknown }).output, undefined);
resetAnalysisJobsForTests();
console.log("CONFIRMED ANALYSIS: completed upstream response is returned as queued without output.");

globalThis.fetch = async () => { throw new Error("Network forbidden in offline audit"); };
const { Session } = await import("../../../server/src/models/Session.ts");
const { User } = await import("../../../server/src/models/User.ts");
const { refreshAuth } = await import("../../../server/src/services/auth/authService.ts");
const userId = "000000000000000000000001";
const user = { _id: userId, name: "Offline fixture", email: "offline@example.invalid", role: "user", isVerified: true, createdAt: new Date(), updatedAt: new Date() };
let sessionsCreated = 0;
Session.findOne = (async () => ({ _id: "000000000000000000000002", userId })) as never;
Session.updateOne = (async () => ({ modifiedCount: 1 })) as never;
Session.create = (async () => ({ _id: `00000000000000000000000${3 + sessionsCreated++}` })) as never;
User.findByIdAndUpdate = (async () => user) as never;
const req = { get: () => undefined, ip: "127.0.0.1" };
const refreshResults = await Promise.all([refreshAuth("same-fake-token", req as never), refreshAuth("same-fake-token", req as never)]);
assert.equal(sessionsCreated, 2);
assert.notEqual(refreshResults[0].refreshToken, refreshResults[1].refreshToken);
console.log("CONFIRMED REFRESH_RACE: two simultaneous reads of one active refresh token produce two sessions (model methods stubbed).");

const { signAccessToken } = await import("../../../server/src/services/auth/tokens.ts");
const { ACCESS_COOKIE } = await import("../../../server/src/services/auth/config.ts");
const { requireAuth, requireAdmin } = await import("../../../server/src/middleware/requireAuth.ts");
User.findById = (async () => user) as never;
const oldAdminToken = await signAccessToken({ sub: userId, sid: "000000000000000000000002", role: "admin" });
const authReq = { cookies: { [ACCESS_COOKIE]: oldAdminToken }, get: () => undefined, auth: undefined };
let middlewareError: unknown;
await requireAuth(authReq as never, {} as never, (error?: unknown) => { middlewareError = error; });
assert.equal(middlewareError, undefined);
requireAdmin(authReq as never, {} as never, (error?: unknown) => { middlewareError = error; });
assert.equal(middlewareError, undefined);
assert.equal((authReq.auth as { role: string; user: { role: string } } | undefined)?.role, "admin");
console.log("CONFIRMED STALE_ROLE: a signed admin token passes requireAdmin after the user row becomes role=user.");

const { storageService } = await import("../../../server/src/services/storage/index.ts");
const { File: StoredFile } = await import("../../../server/src/models/File.ts");
const { readOwnedFile } = await import("../../../server/src/services/storage/fileService.ts");
StoredFile.findOne = (async () => ({ _id: "000000000000000000000004", originalName: "old.txt", mimeType: "text/plain", size: 3, storageProvider: "s3", storageKey: "fake-user/old" })) as never;
let currentBackendRead = false;
storageService.get = async () => { currentBackendRead = true; return Buffer.from("new"); };
await readOwnedFile(userId, "000000000000000000000004");
assert.equal(currentBackendRead, true);
assert.equal(storageService.provider, "local");
console.log("CONFIRMED STORAGE_PROVIDER: a row marked s3 is read from the currently configured local backend.");

const { listUserFiles } = await import("../../../server/src/services/storage/fileService.ts");
let requestedLimit = 0;
StoredFile.find = (() => ({ sort: () => ({ limit: async (limit: number) => { requestedLimit = limit; return []; } }) })) as never;
await listUserFiles(userId);
assert.equal(requestedLimit, 40);
console.log("CONFIRMED FILE_LIST: the Library default query caps results at 40 without a cursor.");

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const compiledMiddleware = path.join(repoRoot, "server/dist/middleware");
const actualDist = path.resolve(compiledMiddleware, "../../client/dist");
const expectedDist = path.join(repoRoot, "client/dist");
assert.notEqual(actualDist, expectedDist);
console.log("CONFIRMED SPA_PATH: server middleware resolves server/client/dist instead of root client/dist (path arithmetic).");
console.log("All offline audit probes completed; no external requests or database connections were made.");
