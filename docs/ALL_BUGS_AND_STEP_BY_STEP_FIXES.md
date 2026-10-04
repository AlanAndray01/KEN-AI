# All identified bugs and step-by-step fixes

Prepared: 2026-10-02  
Status: implementation in progress; verification results will be recorded below.

## Autonomous implementation assessment

I can implement and regression-test **20 of the 30 findings locally** without production credentials or another product decision: **R1-R5, N1-N12, N14-N16**. These are selected for implementation now, not yet claimed fixed.

The remaining **10 require external integration or deployment work to close completely**:

- **R6:** the external analysis runner's status/result and authentication contract is absent. Its full job lifecycle cannot be verified against that service here.
- **N13:** existing-file migration requires the old/new storage configurations and a verified object inventory. Code can guard against wrong-backend access, but that does not restore or migrate objects.
- **W1-W8:** Worker source was pasted in chat, but its deployable project/configuration and authenticated staging access are not in this repository. A revised source draft is possible; closing these issues requires integration and deployment verification. No claim is made that they are impossible to code locally.

Local fixes will not silently change production routing, migrate live records, rotate secrets, or deploy the Worker. Historical database repairs remain a separate operational step even after the corresponding code fix is verified.

## Implementation status (2026-10-03)

Verified locally: `npm run typecheck` exit 0, `npm run lint` exit 0 (the one existing client warning), `npm test` exit 0 (shared 31, server 696, client 309), `npm run build` exit 0. Regression tests: `server/src/services/auditRegressions.test.ts`, `auditRegressions.integration.test.ts`, plus new cases in `routes/auth.test.ts` and `services/chat/prepareTurn.test.ts`.

| Finding | Code status | Still open |
| --- | --- | --- |
| R1, R4 | Fixed: exact admin-approved endpoints only; gateway token bound to the gateway URL; probes use the runtime resolver | Rotate keys if earlier exposure is suspected |
| R2, R5 | Fixed: bootstrap no longer seeds URLs or overwrites admin fields; exact seeded defaults are treated as implicit | Optional DB cleanup of seeded rows (dry run first) |
| R3 | Fixed: native media uses the same route as text; no silent direct-Google retry; custom endpoints refuse media with a 400 | — |
| N1 | Fixed: account-scoped, atomic single-use claim | — |
| N2, N5 | Fixed: pin/unpin/send/regenerate share one expiry | Repair of existing mismatched rows (backup first) |
| N3, N4, N16 | Fixed: prepare before write; edit/regenerate commit in one transaction with conflict check; no regenerate preload | Explicit "restore old answer" UI not built |
| N6, N7, N14, N15 | Fixed | N14 tombstone/retry queue not built |
| N8 | Fixed server-side: toolbar-generated images do not trigger a second generation | Idempotency keys for network retries not built |
| N9, N10, N11, N12 | Fixed: negation/how-to filter; validation before quota; provenance stored and shown; abort + deadlines through image tools | Provider-side billing cancellation depends on vendor |
| R6, N13, W1-W8, C1-C3 | Not changed (need external service, data migration, or Worker deployment) | See sections below |

Transactions require a replica set (MongoDB Atlas qualifies; a local standalone `mongod` does not).

## Scope and how to use this file

This is the consolidated handoff for all findings from the earlier reviews: 6 original findings (R1-R6), 16 additional project findings (N1-N16), and 8 Worker findings (W1-W8). It includes related routing, documentation and feature-support concerns below. IDs match the earlier reports. Integration gaps and hardening recommendations are labelled separately from reproduced defects; these are not 30 independently reproduced failures.

"Industry-standard" here means established engineering practices appropriate to this project: credential isolation, account-bound one-time recovery codes, schema validation, short atomic database operations, idempotent jobs, explicit API contracts, bounded retries, observable failures and regression tests. It is not a certification or a guarantee that no other bugs exist.

- **Reproduced:** demonstrated using fake data/mocked HTTP or database dependencies.
- **Source-confirmed:** verified by inspecting the execution path; end-to-end behavior was not necessarily exercised.
- **Conditional:** applies under the specified configuration, timing, migration or upstream response.
- Worker findings refer to the source supplied in chat. The deployed Worker's authenticated generation behavior and external dashboard controls were not tested.

All entries remain open pending implementation and acceptance tests. The existing audit reproduction scripts intentionally assert the current buggy behavior; turn those cases into desired-behavior regression tests when fixing them.

## Current architecture to preserve or change deliberately

The React client calls Express. Express currently chooses providers, prepares context/tools, streams replies, stores messages and separately generates titles/summaries. Global Groq and Gemini vendor URLs were observed in the prior read-only database inspection; Cloudflare uses its Gateway route where no stored URL overrides it.

The supplied Worker at https://kenai.syedarslanshah7861.workers.dev/ expects authenticated POST using X-API-Key and prompt/content, returns answer/model, and implements text/vision only. Its GET 404 is intentional. It does not generate images.

Images currently follow React -> Express image tool -> configured image backend (Cloudflare Flux in the inspected local configuration, with fallback where configured) -> object/local storage and MongoDB file metadata -> authenticated download. A chat provider base URL does not control this separate flow.

Recommended target: Express remains the user-authentication, ownership, persistence and streaming boundary. Use one explicit routing policy for the Worker and any intentionally separate image/search/voice services. Keep provider secrets out of the browser. Preserve legacy Worker clients when adding a compatible contract.

## Inventory

| ID | Priority/type | Finding |
| --- | --- | --- |
| R1 | Critical | [Platform API key disclosed through user-selected test URL](#r1) |
| N1 | High | [Password-reset code is not always bound to the submitted account](#n1) |
| R2 | High | [Seeded vendor URLs override the enabled Gateway](#r2) |
| R3 | High | [Gemini native media bypasses custom routing and can lose Gateway auth](#r3) |
| R4 | Medium | [Credential probes omit Gateway authentication](#r4) |
| R5 | Medium | [Startup overwrites administrator model choices](#r5) |
| R6 | Medium | [Data-analysis jobs never deliver completed output](#r6) |
| N2 | High | [Pinning and unpinning do not synchronize message retention](#n2) |
| N3 | High | [Failed regeneration hides the old answer and later messages](#n3) |
| N4 | Medium | [Regeneration can send stale discarded history](#n4) |
| N5 | Medium | [Regenerated assistant messages omit expiry](#n5) |
| N6 | Medium | [Pagination skips messages with the same timestamp](#n6) |
| N7 | Medium | [Export all silently omits archived and older conversations](#n7) |
| N8 | Medium | [Toolbar generation plus Send can generate an image twice](#n8) |
| N9 | Medium | [Negated or instructional text triggers unwanted image generation](#n9) |
| N10 | Medium | [Flux input validation happens after spending image quota](#n10) |
| N11 | Medium | [Displayed image model can differ from actual producing backend](#n11) |
| N12 | Medium | [Slow image preparation cannot be reliably stopped](#n12) |
| N13 | Medium | [Storage configuration changes break old-file access](#n13) |
| N14 | Medium | [Local file deletion suppresses permission and I/O errors](#n14) |
| N15 | Low | [Chat deletion leaves orphan share and attachment relationships](#n15) |
| N16 | Medium | [Failed editing leaves an unmatched persisted user turn](#n16) |
| W1 | High integration blocker | [Worker and project use incompatible API contracts](#w1) |
| W2 | Medium integration gap | [Worker drops history/system roles and lacks streaming/output controls](#w2) |
| W3 | Medium | [Kimi K2 label is attached to a Llama 3.2 request](#w3) |
| W4 | Low | [Documented fallback order differs from executed order](#w4) |
| W5 | High conditional | [Worker parses native Cloudflare output as OpenAI choices only](#w5) |
| W6 | Medium | [Worker reports total failure as HTTP 200 answer text](#w6) |
| W7 | Medium | [Worker retries have no deadlines or key cooldown policy](#w7) |
| W8 | Medium hardening gap | [Worker input validation and application-level user quotas are incomplete](#w8) |

## Detailed fixes

<a id="r1"></a>

### R1: Platform API key disclosed through user-selected test URL

**Priority/type:** Critical  
**Evidence:** Reproduced previously  
**Location:** `server/src/services/ai/providerService.ts:219`

**Problem:** A normal user's credential test can send the platform key to a URL supplied by that user.

**Step-by-step fix:**

1. Add regression tests using a fake platform key and a controlled HTTP stub; assert that an arbitrary destination never receives it.
2. Bind each platform credential to an administrator-controlled destination. User-selected endpoints must use that user's explicit credential; never inherit a platform key.
3. Use an outbound destination policy: approved HTTPS hosts where possible, internal-address rejection for user URLs, validated DNS resolution, and redirects disabled or revalidated before following. Keep localhost/Ollama exceptions admin-only.
4. Build probe and generation authentication through the same resolver. Redact secrets from errors and logs; review exposure evidence and rotate affected keys if exposure occurred.

**Acceptance:** A caller-selected URL cannot receive platform credentials, including through redirects or DNS/address tricks. See OWASP SSRF guidance below.


<a id="n1"></a>

### N1: Password-reset code is not always bound to the submitted account

**Priority/type:** High  
**Evidence:** Reproduced with mocked account records  
**Location:** `server/src/services/auth/authService.ts:289`

**Problem:** An unknown email removes the userId condition from the reset lookup; a matching active code can then select another account.

**Step-by-step fix:**

1. Add tests for unknown email, wrong email, identical codes on different accounts, expiry, reuse, and simultaneous reset requests.
2. Resolve the normalized email to an account; reject generically when no account exists. Query only reset records belonging to that account.
3. Hash the new password before opening a short database transaction. Inside it, atomically claim the unused, unexpired reset record and update the account; revoke applicable sessions in the same consistent operation.
4. Keep generic error responses, short expiry and account/IP attempt controls. Do not mark another account verified through an unscoped code lookup.

**Acceptance:** Only the intended account can be reset, and concurrent use of one code produces at most one committed reset. See OWASP password-reset guidance below.


<a id="r2"></a>

### R2: Seeded vendor URLs override the enabled Gateway

**Priority/type:** High  
**Evidence:** Reproduced previously; seeded URLs observed in prior DB inspection  
**Location:** `server/src/services/ai/bootstrap.ts:33; server/src/services/ai/credentials.ts:227`

**Problem:** Bootstrap stores vendor defaults as if they were deliberate custom overrides.

**Step-by-step fix:**

1. Add tests for vendor-default routing, Gateway mode, explicit custom URLs, and existing seeded database rows.
2. Represent routing mode and URL provenance explicitly: vendor default, Gateway, or administrator override. Preserve intentional custom endpoints.
3. Create one destination resolver with documented precedence. Do not treat an automatically seeded URL as a custom override.
4. Write a dry-run migration identifying exact built-in default URLs. Back up and migrate only those rows; retain an audit of changes and invalidate configuration caches.

**Acceptance:** Gateway mode routes eligible providers through the Gateway while deliberate custom endpoints remain unchanged.


<a id="r3"></a>

### R3: Gemini native media bypasses custom routing and can lose Gateway auth

**Priority/type:** High  
**Evidence:** Reproduced URL/header mismatch; live rejection not tested  
**Location:** `server/src/services/ai/providers/GeminiProvider.ts:52; server/src/services/ai/AIProviderManager.ts:545`

**Problem:** Native image/PDF requests use different addressing from text and can retry Google directly.

**Step-by-step fix:**

1. Add outbound-request tests for text, image and PDF under direct, Gateway, custom and Worker-only modes.
2. Resolve native and compatible endpoints explicitly from the same provider configuration; do not construct native addressing from unrelated global state.
3. Derive auth headers from the final destination and protocol. Never send a Gateway token to an unrelated host.
4. Make direct-vendor fallback explicit and disable it in Worker-only mode. Reject unsupported media before sending rather than silently bypassing the chosen route.

**Acceptance:** Every media request obeys the selected routing policy with the correct auth, or returns a clear unsupported-capability error.


<a id="r4"></a>

### R4: Credential probes omit Gateway authentication

**Priority/type:** Medium  
**Evidence:** Reproduced previously  
**Location:** `server/src/services/ai/providerService.ts:186; server/src/services/ai/providerService.ts:225`

**Problem:** Settings can report valid Gateway credentials as invalid.

**Step-by-step fix:**

1. Test both admin and user probes against a fake endpoint that requires Gateway authentication.
2. Reuse the production destination/auth resolver for probes, while keeping the credential-ownership restrictions from R1.
3. Select the probe by protocol. A custom Worker need not implement the generic GET /models convention; Cloudflare's native catalog probe must not falsely validate a different custom endpoint.
4. Return distinct auth, endpoint, timeout and unsupported-probe results without exposing secrets.

**Acceptance:** Probes validate the actual configured service with the same applicable headers as generation.


<a id="r5"></a>

### R5: Startup overwrites administrator model choices

**Priority/type:** Medium  
**Evidence:** Reproduced previously  
**Location:** `server/src/services/ai/bootstrap.ts:55`

**Problem:** Existing Gemini models are re-enabled on restart and display metadata can be overwritten.

**Step-by-step fix:**

1. Add a restart/bootstrap test with a disabled model and edited display name/description.
2. Set initial enabled state using insert-only defaults, not an unconditional update.
3. Separate catalog-owned capability/version metadata from administrator-owned enabled and display settings.
4. Refresh catalog fields idempotently and invalidate caches. Restore previous admin choices only from reliable history/backups; do not guess them.

**Acceptance:** Repeated bootstrap runs preserve admin choices and do not create duplicate provider/model rows.


<a id="r6"></a>

### R6: Data-analysis jobs never deliver completed output

**Priority/type:** Medium  
**Evidence:** Reproduced previously  
**Location:** `server/src/services/analysis/ExternalAnalysisRunner.ts:35; server/src/services/tools/ToolManager.ts:172`

**Problem:** Jobs stay in an in-memory queued map, runner responses are discarded, and chat discards the returned job.

**Step-by-step fix:**

1. Keep the capability unavailable while implementing a persistent job model with owner, runner ID, state, timestamps, result and error.
2. Persist runner acknowledgement and implement either bounded polling or authenticated callbacks. Make transitions idempotent and tolerate duplicate/out-of-order updates.
3. Return the job ID to the client, expose owner-checked status/output, and feed completed analysis results into chat.
4. Add restart recovery, timeout/expiry cleanup, bounded result sizes and tests for completion, failure, duplicate callback and cross-user access.

**Acceptance:** A completed job produces visible output; restart does not lose it, and another user cannot access it.


<a id="n2"></a>

### N2: Pinning and unpinning do not synchronize message retention

**Priority/type:** High  
**Evidence:** Reproduced update behavior; TTL consequence source-confirmed  
**Location:** `server/src/services/chat/conversationService.ts:93; server/src/models/Message.ts:49`

**Problem:** Pinned conversations can retain a title while old messages expire; unpinning and renewed activity also leave inconsistent dates.

**Step-by-step fix:**

1. Specify retention semantics: pinned conversations keep their messages; unpinned messages follow the chosen conversation expiry policy.
2. Use one retention service for pin, unpin, send, edit and regenerate. Apply conversation/message updates atomically where practical; prevent concurrent sends from writing stale expiry.
3. Inventory mismatched existing dates, back up affected rows and run an idempotent repair. Do not promise recovery of already deleted messages.
4. Test pin/unpin near expiry, new messages during pinning, resumed conversations and eventual TTL cleanup. If adopting an authoritative cleanup job instead, retire conflicting TTL indexes via a controlled migration.

**Acceptance:** Pinned messages have no effective expiry, and unpinned threads follow one documented policy. TTL removal is asynchronous, not exact-time scheduling.


<a id="n3"></a>

### N3: Failed regeneration hides the old answer and later messages

**Priority/type:** High  
**Evidence:** Source-confirmed  
**Location:** `server/src/services/chat/prepareGeneration.ts:315`

**Problem:** The old branch is superseded before replacement preparation succeeds.

**Step-by-step fix:**

1. Create failure tests at model validation, attachment preparation, image generation and database-write boundaries.
2. Validate ownership, selected model and capabilities before modifying visible history. Stage any external tool work under a durable attempt ID.
3. In a short transaction, use a conversation version check, create the replacement attempt and update the branch consistently. Do not call external AI inside the transaction.
4. Retain the original branch for recovery. If replacement generation fails after preparation, expose the failed attempt with an explicit restore/retry path rather than losing the original content.

**Acceptance:** Preparation failure leaves old history visible; concurrent regenerations cannot both silently replace the same branch.


<a id="n4"></a>

### N4: Regeneration can send stale discarded history

**Priority/type:** Medium  
**Evidence:** Source-confirmed; timing-dependent  
**Location:** `server/src/controllers/chatController.ts:157; server/src/services/chat/streamTurn.ts:138`

**Problem:** History preloading races with branch supersession.

**Step-by-step fix:**

1. Add a deterministic concurrency test that pauses preparation while the preload finishes.
2. Remove generic preloading from regeneration, or make it target an explicit immutable branch/version.
3. Build model context after the branch decision, ending at the target user turn and excluding the replaced answer and subsequent discarded messages.
4. Use version-aware cache keys/invalidation so cached history cannot reintroduce old branch data.

**Acceptance:** Captured model input contains only the intended branch, regardless of query timing.


<a id="n5"></a>

### N5: Regenerated assistant messages omit expiry

**Priority/type:** Medium  
**Evidence:** Source-confirmed  
**Location:** `server/src/services/chat/prepareGeneration.ts:344`

**Problem:** Regenerated rows can survive after an expiring conversation is removed.

**Step-by-step fix:**

1. Add equivalent retention tests for send, edit and regenerate.
2. Pass the authoritative expiry through the shared message-construction helper; pinned rows must omit expiry consistently.
3. Update regenerated-message persistence to use that helper and handle concurrent retention changes.
4. Include existing missing-expiry rows and orphan messages in the backed-up retention repair from N2.

**Acceptance:** All message creation paths apply the same retention rules.


<a id="n6"></a>

### N6: Pagination skips messages with the same timestamp

**Priority/type:** Medium  
**Evidence:** Reproduced query shape  
**Location:** `server/src/services/chat/conversationService.ts:126`

**Problem:** The cursor filters only createdAt although sorting also uses _id.

**Step-by-step fix:**

1. Create records sharing one timestamp and test pagination with page size one.
2. Use the same descending (createdAt, _id) tuple for sort and cursor: createdAt < cursorTime OR (createdAt = cursorTime AND _id < cursorId).
3. Keep conversation/owner/visibility restrictions in both cursor lookup and page query; reject invalid or foreign cursors explicitly.
4. Check the query plan and add a matching compound index if needed. Test multiple pages, concurrent new inserts and no duplicate/missing IDs.

**Acceptance:** Every eligible message appears once across pages, including timestamp ties.


<a id="n7"></a>

### N7: Export all silently omits archived and older conversations

**Priority/type:** Medium  
**Evidence:** Reproduced query shape  
**Location:** `server/src/services/export/exportService.ts:65`

**Problem:** Only 200 non-archived conversations are exported; message queries also cap at 5,000.

**Step-by-step fix:**

1. Add fixtures with 201+ conversations, archived/empty chats and messages beyond a page boundary.
2. Paginate with stable IDs and stream output or run a background export job; include archived chats unless the user explicitly filters them.
3. Capture an export cutoff/snapshot policy so concurrent edits have documented behavior. Include counts and a manifest of any deliberate exclusions or failures.
4. Remove silent limits; where a resource limit is necessary, return an explicit incomplete result instead of presenting it as a full backup.

**Acceptance:** The export count matches its declared scope and no truncation is silent.


<a id="n8"></a>

### N8: Toolbar generation plus Send can generate an image twice

**Priority/type:** Medium  
**Evidence:** Source-confirmed; full request count not yet reproduced  
**Location:** `client/src/hooks/useChatAttachments.ts:60; server/src/services/chat/prepareTurn.ts:81`

**Problem:** The generated image is attached while its unchanged draft triggers generation again.

**Step-by-step fix:**

1. Add an integration test for Generate image -> Send using a counted fake image provider.
2. Represent generation as an explicit action with a client request ID and server-owned result/attempt record.
3. Persist a unique (user, operation, idempotency key) record and request hash; duplicate submissions return the original attempt/result and conflicting payloads are rejected.
4. Send an already generated result as an attachment without re-detecting it as a new generation. After ambiguous upstream timeouts, reconcile or report uncertainty instead of blindly generating again.

**Acceptance:** Toolbar -> Send and ordinary retries issue one generation attempt; do not claim exactly-once upstream execution without provider support.


<a id="n9"></a>

### N9: Negated or instructional text triggers unwanted image generation

**Priority/type:** Medium  
**Evidence:** Reproduced  
**Location:** `server/src/services/chat/imageIntent.ts:58`

**Problem:** Regex matching treats requests not to generate and questions about generation as image actions.

**Step-by-step fix:**

1. Add regression examples for negation, quoted prompts, API/code questions and supported languages including Roman Urdu.
2. Use an explicit image action as the authoritative signal; default uncertain text to ordinary chat.
3. If automatic detection remains, distinguish a creation request from a discussion of creation and handle negation before triggering tools.
4. Verify the decision before consuming image quota and provide an obvious way to choose image mode.

**Acceptance:** Instructional and negated prompts cause zero image-provider calls.


<a id="n10"></a>

### N10: Flux input validation happens after spending image quota

**Priority/type:** Medium  
**Evidence:** Source-confirmed  
**Location:** `client/src/utils/attachmentGate.ts:51; server/src/services/chat/prepareTurn.ts:93`

**Problem:** Frontend permits an attachment that backend rejects only after generation and storage.

**Step-by-step fix:**

1. Define distinct capabilities for text-to-image, image understanding and image editing.
2. Validate request ownership, file types and required capability before rate-limit charging or external generation.
3. Drive frontend acceptance from the same capability contract, with server validation remaining authoritative.
4. Test unsupported attachments for zero outbound calls and zero stored output; test supported operations separately.

**Acceptance:** Unsupported image operations fail before generation or storage.


<a id="n11"></a>

### N11: Displayed image model can differ from actual producing backend

**Priority/type:** Medium  
**Evidence:** Source-confirmed; selection/fallback-dependent  
**Location:** `server/src/services/image/index.ts:40; server/src/services/image/ImageGenerationProvider.ts:6`

**Problem:** Global backend choice and fallback can disagree with the selected model; results omit provenance.

**Step-by-step fix:**

1. Define explicit versus automatic image routing, including whether cross-provider fallback is permitted.
2. Return actual providerId, modelId, requestId and applicable usage with every generated result.
3. Persist provenance on the file/message and show the actual producer after fallback.
4. Test pinned selection under different environment defaults, fallback success and exhausted fallback; ensure logs, UI and accounting agree.

**Acceptance:** A result is never labelled as a model that did not produce it.


<a id="n12"></a>

### N12: Slow image preparation cannot be reliably stopped

**Priority/type:** Medium  
**Evidence:** Source-confirmed  
**Location:** `server/src/services/chat/prepareGeneration.ts:57; server/src/controllers/chatController.ts:264`

**Problem:** Abort/heartbeat handling starts after slow preparation, and image fetches have no signal/deadline.

**Step-by-step fix:**

1. Allocate the attempt ID, abort controller and total deadline before preparation.
2. Register disconnect/Stop handling and stream heartbeats before running slow tools; pass the signal through preparation, storage where supported, and provider calls.
3. Apply per-attempt deadlines within one total retry budget; clear listeners/timers in finally blocks.
4. Persist a terminal cancelled/timed-out state and clean staged artifacts. Test Stop before first output, upstream hang, disconnect and cancellation during fallback.

**Acceptance:** Cancellation settles the application attempt promptly without starting new fallback calls; upstream billing cancellation depends on provider behavior.


<a id="n13"></a>

### N13: Storage configuration changes break old-file access

**Priority/type:** Medium  
**Evidence:** Source-confirmed; migration-dependent  
**Location:** `server/src/services/storage/fileService.ts:100`

**Problem:** Reads and deletes use global current storage rather than the provider recorded on each file.

**Step-by-step fix:**

1. Associate each file with an immutable storage configuration ID, provider and object key; provider name alone cannot distinguish two buckets.
2. Resolve reads, deletes and model materialization using that record; keep old configurations available during migration.
3. For migration, copy objects, verify size/checksum, atomically switch each file reference, and retain the source until verification/rollback windows end.
4. Test mixed backend records, interrupted migration, missing objects and rollback without rewriting all references prematurely.

**Acceptance:** Old and new files work throughout a backend change, and deletion reaches the correct storage location.


<a id="n14"></a>

### N14: Local file deletion suppresses permission and I/O errors

**Priority/type:** Medium  
**Evidence:** Source-confirmed  
**Location:** `server/src/services/storage/LocalDiskStorage.ts:27`

**Problem:** Metadata can be deleted even when bytes remain on disk.

**Step-by-step fix:**

1. Test missing-file, access-denied and transient I/O cases separately.
2. Treat only ENOENT as already deleted; propagate other errors in a sanitized form.
3. Persist a deletion task/tombstone and retry failed object deletion before removing the last durable storage reference.
4. Expose pending/failed deletion accurately and alert on exhausted retries without logging private file content.

**Acceptance:** Deletion is reported complete only when the object is gone or confirmed absent.


<a id="n15"></a>

### N15: Chat deletion leaves orphan share and attachment relationships

**Priority/type:** Low  
**Evidence:** Source-confirmed  
**Location:** `server/src/services/chat/conversationService.ts:106`

**Problem:** Messages and conversation are removed without cleaning dependent rows.

**Step-by-step fix:**

1. List dependent share/attachment records by conversation and distinguish them from independently owned Library files.
2. Remove relationships and conversation/message records consistently in a short transaction or resumable deletion job.
3. Preserve files referenced by other chats, GPT knowledge or the Library; delete object bytes only according to explicit ownership/retention rules.
4. Add an idempotent orphan sweeper and tests for repeated deletion, shared files and interrupted cleanup.

**Acceptance:** No orphan relationship remains while reusable files remain intact.


<a id="n16"></a>

### N16: Failed editing leaves an unmatched persisted user turn

**Priority/type:** Medium  
**Evidence:** Source-confirmed  
**Location:** `server/src/services/chat/prepareGeneration.ts:198`

**Problem:** The revised message and copied attachments are saved before model/tool validation.

**Step-by-step fix:**

1. Add failure tests after message creation, attachment copying and model/tool validation.
2. Validate before persistence and stage external work under the same attempt lifecycle used for regeneration.
3. Commit revised message, assistant attempt, attachment links and counters together with a conversation version check.
4. If generation later fails, persist a deliberate error state with retry/recovery rather than leaving an unexplained partial turn.

**Acceptance:** Preparation failures do not append invisible or inconsistent data; counters and visible messages agree.


<a id="w1"></a>

### W1: Worker and project use incompatible API contracts

**Priority/type:** High integration blocker  
**Evidence:** Source-confirmed against supplied Worker  
**Location:** `Worker fetch handler; server/src/services/ai/providers/OpenAICompatibleProvider.ts`

**Problem:** Auth headers, request fields, response fields, streaming and model probing differ.

**Step-by-step fix:**

1. Write contract fixtures for the supplied legacy Worker: X-API-Key, prompt/content and answer/model.
2. Preferred migration: add explicit compatible /v1/chat/completions and /v1/models routes while preserving existing legacy clients. Define auth for each route.
3. Register one dedicated Worker provider in Express. Keep its credential server-side; route generation and probes using the declared protocol.
4. Test text, media, invalid auth, errors and response parsing against local Worker fixtures, then a controlled staging deployment.

**Acceptance:** Changing the configured Worker URL is sufficient after contract support exists; no client-side secrets or ad-hoc endpoint guessing are needed.


<a id="w2"></a>

### W2: Worker drops history/system roles and lacks streaming/output controls

**Priority/type:** Medium integration gap  
**Evidence:** Source-confirmed against supplied Worker  
**Location:** `Worker callCerebras/callGroq/callDeepSeek and fetch handler`

**Problem:** Only one user message is forwarded; several calls fix output at 1,024 tokens.

**Step-by-step fix:**

1. Validate a messages array with supported roles and typed content parts; preserve system instructions and conversation ordering.
2. Forward history subject to model context limits and an explicit trimming policy; honor bounded output-token requests.
3. Implement true upstream-to-client SSE for supported providers, including finish/error semantics and cancellation. Otherwise advertise non-streaming and adapt explicitly.
4. Test follow-up references, persona instructions, split SSE frames, long output and partial-stream failure without silently changing provider after visible output.

**Acceptance:** Supported capabilities match the advertised contract; history and role information survive the Worker hop.


<a id="w3"></a>

### W3: Kimi K2 label is attached to a Llama 3.2 request

**Priority/type:** Medium  
**Evidence:** Source-confirmed against supplied Worker  
**Location:** `Worker callKimiK2`

**Problem:** Function/label disagrees with the actual Cloudflare model ID.

**Step-by-step fix:**

1. Rename the function and display label to the actual Llama model unless a real Kimi integration is intentionally implemented.
2. Return structured provider/model IDs separately from display labels.
3. Derive labels from one model catalog instead of hardcoded function strings.
4. Assert that the outgoing model ID equals result provenance in a mocked request test.

**Acceptance:** The UI and logs identify the actual model.


<a id="w4"></a>

### W4: Documented fallback order differs from executed order

**Priority/type:** Low  
**Evidence:** Source-confirmed against supplied Worker  
**Location:** `Worker header comment and providers array`

**Problem:** Comment says DeepSeek before Groq, while code tries Groq first.

**Step-by-step fix:**

1. Choose and record the intended order; do not infer intent from the inaccurate comment alone.
2. Store that order in one routing configuration consumed by execution.
3. Generate or verify documentation and diagnostics against the same configuration.
4. Use counted fake providers to test first success and exact attempt order under failure.

**Acceptance:** Configuration, implementation and documentation show the same order.


<a id="w5"></a>

### W5: Worker parses native Cloudflare output as OpenAI choices only

**Priority/type:** High conditional  
**Evidence:** Source/documentation-confirmed; live payload not captured  
**Location:** `Worker callKimiK2 and callLlama4Scout`

**Problem:** A successful native result.response can be discarded as empty.

**Step-by-step fix:**

1. Add sanitized native response fixtures for the exact deployed model/API versions, including documented result.response output.
2. Implement protocol-specific response validation and normalization rather than a shared OpenAI-only lookup.
3. Validate Cloudflare success/errors as well as HTTP status; distinguish empty model output from an incompatible schema.
4. Test normal text, vision, malformed JSON, native error envelopes and any intentionally supported compatibility shapes.

**Acceptance:** Successful documented native output becomes an answer; malformed/error payloads become structured failures.


<a id="w6"></a>

### W6: Worker reports total failure as HTTP 200 answer text

**Priority/type:** Medium  
**Evidence:** Source-confirmed against supplied Worker  
**Location:** `Worker jsonRes and failure branches`

**Problem:** Clients cannot reliably distinguish a real answer from service failure.

**Step-by-step fix:**

1. Define a response schema with structured error code, safe message, request ID and retryability.
2. Use appropriate statuses such as 400/401 for request/auth errors, 429 for throttling and 502/503/504 for upstream failure/timeout.
3. Log sanitized attempt outcome and timing; never log provider secrets or full private prompts by default.
4. Update the Express adapter/UI to handle errors explicitly and avoid saving warning strings as successful assistant answers.

**Acceptance:** All-provider failure produces an error path and useful safe diagnostics.


<a id="w7"></a>

### W7: Worker retries have no deadlines or key cooldown policy

**Priority/type:** Medium  
**Evidence:** Source-confirmed against supplied Worker  
**Location:** `Worker upstream fetch loops`

**Problem:** A hung call blocks fallback; every request starts with the first configured key.

**Step-by-step fix:**

1. Set a total request deadline and per-attempt connect/response budgets; propagate caller cancellation.
2. Classify failures: do not retry invalid input; skip invalid credentials; respect quota cooldown/Retry-After; bound transient retries with jitter.
3. Rotate among eligible keys and maintain shared cooldown/concurrency state when coordination across Worker instances is required.
4. Make one layer responsible for provider fallback and cap attempts; test hangs, rate limits, invalid keys, caller abort and exhausted budget.

**Acceptance:** One request cannot create an unbounded wait or retry multiplication across Express and Worker.


<a id="w8"></a>

### W8: Worker input validation and application-level user quotas are incomplete

**Priority/type:** Medium hardening gap  
**Evidence:** Source-confirmed; external dashboard controls not inspected  
**Location:** `Worker fetch handler`

**Problem:** Truthiness checks accept invalid content shapes; any array selects vision. The supplied code has no per-user quota.

**Step-by-step fix:**

1. Apply a schema to request body, allowed fields, string lengths, media types/counts and payload size. Use content parts to determine actual vision need.
2. Keep CT_AI_KEY on Express/Worker, never in browser bundles. Authenticate before expensive parsing/provider calls where feasible.
3. Enforce user quotas in Express and a bounded Worker-level budget. Trust user identity only through authenticated server-to-Worker assertions, not arbitrary browser headers.
4. Test malformed/oversized requests, text-only arrays, unauthenticated calls and concurrent quota consumption. Audit dashboard controls separately before claiming coverage.

**Acceptance:** Invalid inputs cause no model calls; quotas are enforced at the intended identity boundary.

## Related findings that must not be lost during consolidation

### C1: Background calls and special paths bypass Worker-only intent

**Source-confirmed integration concern.** Files: `server/src/services/chat/chatTitle.ts`, `conversationSummary.ts`, `autoRoute.ts`, `server/src/services/ai/attachmentRoute.ts`, and `server/src/services/image/index.ts`.

Title and rolling-summary requests have separate provider preferences. Auto, attachments and image fallback can also leave a provider chosen in the chat picker. This is not necessarily wrong in a multi-provider product, but violates a Worker-only requirement.

1. Enumerate outbound operation kinds: chat, title, summary, vision, documents, images, probes, search and voice.
2. Store an explicit allow/deny routing policy for each kind. Worker-only text must include title and summary, not just visible chat.
3. Pass that policy through every resolver and retry path; unsupported operations must fail clearly or use an explicitly selected separate service.
4. Add a mocked outbound-request test covering every operation. Assert that forbidden hosts are never called.

**Acceptance:** the product can explain and enforce where each operation goes. The custom Worker must gain image-generation support before claiming images pass through it.

### C2: Unsupported legacy provider and misleading connection tests

A legacy Anthropic row appeared in the earlier global database inspection, although the current factory has no dedicated Anthropic adapter. Cloudflare probes can use its native catalog while a custom base URL is configured. These require capability/protocol checks, not simply an enabled database flag.

1. Inventory configured provider types, matching adapters and model capabilities without reading or printing raw keys.
2. Reject or disable unsupported provider types; migrate stale records with a dry-run report. Do not delete valid user settings indiscriminately.
3. Declare a provider-specific validation method and test the exact selected destination (see R4).
4. Test that unsupported providers cannot appear as successfully configured/routable.

### C3: Routing documentation and optional workspace verification have drifted

`docs/REQUEST_ROUTING.md` describes quota failover for pinned chat and Flux-only image behavior that do not fully describe the inspected implementation. Root verification scripts also omit the optional Multi-Agents workspace.

1. Refresh routing documentation after the routing policy is implemented; cover actual pinned/Auto behavior, images, native media and hidden background calls.
2. Derive model/order examples from shared configuration or add small documentation/config consistency checks.
3. If Multi-Agents remains supported, run its own typecheck/lint in an appropriate CI job; otherwise label it optional and outside application release checks.
4. Keep a dated verification record and remove claims of live provider verification unless backed by current evidence.

## Recommended delivery order

Treat these as small reviewable changes. Do not attempt one large rewrite.

| Step | Work | Findings covered | Exit condition |
| --- | --- | --- | --- |
| 1 | Security regression tests and fixes | R1, N1 | Secrets remain at trusted destinations; reset codes are account-bound and single-use. |
| 2 | Retention, pagination and exports | N2, N5, N6, N7 | No pin-related expiry loss or missing page/export records. |
| 3 | Atomic edit/regenerate lifecycle and branch context | N3, N4, N16 | Failure leaves history consistent; concurrent operations are version-checked. |
| 4 | Define/implement the Worker contract | W1-W6, W8 | Legacy compatibility retained; new routes pass contract tests. |
| 5 | Centralize endpoint/auth/routing policy | R2-R5, C1-C2 | Probes, text, media and background calls follow policy and preserve admin settings. |
| 6 | Unify image actions and attribution | N8-N11 | One action does not accidentally generate twice; producer metadata is accurate. |
| 7 | Add deadlines, cancellation and bounded retry coordination | N12, W7 | Stop/disconnect/hangs terminate predictably without multiplying retries. |
| 8 | Repair storage and deletion lifecycle | N13-N15 | Mixed storage works and failed deletion remains recoverable. |
| 9 | Complete or hide analysis; simplify unsupported features | R6, feature table below | Every visible feature has a working supported path or clear unavailable state. |
| 10 | Apply tested migrations and release verification | All, C3 | Staging regressions pass; migration results and rollback limits are reviewed. |

Security fixes should not wait for the Worker redesign. Retention repairs should follow the corrected retention code promptly rather than waiting until all later steps are complete.

## Database and deployment precautions

1. **Inventory first:** produce counts/IDs for expiry mismatches, regenerated rows missing expiry, orphan references, seeded defaults and unsupported providers. Exclude secrets and private message contents from reports.
2. **Back up affected records and verify restore procedures:** expiry fields matter because restoring already expired documents under active TTL indexes can cause immediate later deletion. Record indexes and relevant configuration with the backup.
3. **Use expand/migrate/contract changes:** add new fields and backwards-compatible readers first, migrate in batches, then remove obsolete behavior only after verification.
4. **Make migrations idempotent and resumable:** use checkpoints, expected-version filters, small batches and matched/modified counts. Do not blindly clear every provider URL.
5. **Keep transactions short:** verify that the deployment supports the transaction strategy. External AI/storage requests belong outside database transactions; use durable jobs/attempt states to reconcile external effects. Use transaction retry handling carefully so it cannot repeat billable calls.
6. **Coordinate TTL changes:** MongoDB TTL does not cascade into related collections and deletion is asynchronous. Choose one authoritative retention lifecycle. If replacing TTL with a cleanup worker, deploy and validate that worker before retiring the old cleanup mechanism.
7. **Stage the rollout:** use fake upstreams for deterministic tests, then controlled staging requests for the actual Worker protocol. Preserve the old Worker contract until existing clients are migrated.
8. **Plan rollback realistically:** retain prior route/config versions and copied storage objects for an agreed window. Reverting code cannot restore already deleted records or undo provider charges.

MongoDB documents the relevant [transaction deployment constraints](https://www.mongodb.com/docs/manual/core/transactions-production-consideration/) and [TTL behavior](https://www.mongodb.com/docs/manual/core/index-ttl/).

## Feature decisions

These are recommendations for your Worker-based product, not automatic deletion instructions.

| Feature | Decision | Step-by-step action |
| --- | --- | --- |
| Duplicate toolbar/automatic image generation | Consolidate | Implement N8-N10; use one explicit action; remove the redundant execution path after regression tests. |
| Independent Express and Worker fallback routers | Consolidate responsibility | Choose one provider-fallback owner; retain only bounded transport retry at the other layer; test request counts. |
| Legacy Anthropic/unsupported providers | Disable or implement intentionally | Inventory; migrate stale records; hide unsupported choices; add a real protocol adapter only if required. |
| Data analysis | Hide until complete | Disable advertised capability; implement R6; enable only after restart/result/ownership tests pass. |
| Unconfigured web search/server voice | Hide or clearly mark unavailable | Gate controls using server capability status; retain browser speech fallback where supported. |
| Multi-Agents workspace | Optional development tooling | Keep if used; otherwise remove workspace/dependencies/scripts together in a separate change. It is not required for the deployed chat runtime. |
| Broad BYOK/provider-key settings | Conditional | Keep for a deliberate bring-your-own-key product; otherwise hide in Worker-only mode after securing backend endpoints. |
| Share/export receipt notifications | Optional UI simplification | Remove only if unwanted; remove producers and UI together rather than leaving dead endpoints. |
| History, pinning, export, Library, images | Keep and fix | These have clear user value; apply the corresponding data-integrity/storage/image fixes. |
| Provider adapters and context interfaces | Keep | They make protocol changes maintainable; centralize configuration rather than deleting useful boundaries. |

## Regression and release checklist

- [ ] Security: untrusted URL cannot receive a platform key; reset code cannot cross accounts or be consumed twice.
- [ ] Data: pin/unpin and all message constructors agree on expiry; edits/regeneration survive failures and concurrency.
- [ ] Pagination/export: tied timestamps, archived chats and records beyond old limits are covered.
- [ ] Routing: direct/Gateway/custom/Worker-only matrices cover text, media, probe, title and summary.
- [ ] Worker: legacy and compatible contracts, typed content, actual model IDs, error statuses, native Cloudflare output and stream framing are tested.
- [ ] Images: negation/how-to prompts produce no generation; toolbar -> Send does not duplicate; capability failure precedes spending; attribution survives fallback.
- [ ] Reliability: hung upstream, rate limits, invalid credentials, cancellation and disconnects remain within attempt/deadline budgets.
- [ ] Storage: mixed configurations, interrupted migration, ENOENT versus permission failure, account/chat deletion and reusable files are covered.
- [ ] Analysis: persistent jobs finish/fail, recover after restart and enforce owner access before the feature is enabled.
- [ ] Run relevant checks per change, then `npm.cmd run typecheck`, `npm.cmd run lint`, `npm.cmd test`, `npm.cmd run build` and applicable browser E2E.
- [ ] Capture actual process exit codes. The earlier PowerShell wrapper reported an error for test stderr despite passing Vitest summaries; do not confuse those two results.
- [ ] Check optional Multi-Agents separately if it remains supported.
- [ ] Verify migrations in staging, including counts, checksums where relevant, and rollback limitations.

## Evidence and limitations

Earlier reports: [September audit](AUDIT-2026-09-30.md) and [October audit](BUG-AUDIT-AND-FIX-PLAN-2026-10-02.md).

Offline evidence scripts: [routing reproduction](audit-routing-repro.mts) and [additional reproduction](audit-additional-repro.mjs). They are diagnostic demonstrations, not proof that the implementation is fixed.

Historical verification: 1,004 Vitest tests reported passing, earlier build/typecheck passed, one lint warning; the test shell-wrapper caveat is recorded in the earlier audit. The October follow-up rebuilt the server and demonstrated five additional cases. This consolidation is documentation-only; these application tests were not rerun for this file.

Remaining investigation areas are browser/mobile flows, live Worker/provider behavior, multi-tab/session concurrency, production restarts/storage outages and dashboard controls. They are not additional confirmed bugs simply because they have not been tested.

## Engineering references

The steps above adapt these sources to this repository; the sources do not independently audit this project.

- [OWASP Forgot Password Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html): account-bound, expiring, single-use reset credentials and protections against guessing; applied in N1.
- [OWASP SSRF Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html): outbound destination restrictions and redirect/DNS handling; applied in R1.
- [MongoDB transaction production considerations](https://www.mongodb.com/docs/manual/core/transactions-production-consideration/): deployment and lifetime constraints for the atomic database operations proposed above.
- [MongoDB TTL indexes](https://www.mongodb.com/docs/manual/core/index-ttl/): document expiry behavior; applied in N2/N5 and migration planning.
- [Cloudflare Llama 3.2 native model output](https://developers.cloudflare.com/workers-ai/models/llama-3.2-3b-instruct/) and [Scout model output](https://developers.cloudflare.com/ai/models/%40cf/meta/llama-4-scout-17b-16e-instruct/): native response shape used in the prior W5 review. Confirm exact deployed response fixtures before rollout.
