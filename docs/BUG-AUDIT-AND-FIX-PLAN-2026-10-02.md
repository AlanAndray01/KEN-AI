# Bug audit and ordered fix plan — 2026-10-02

This extends [the September 30 audit](AUDIT-2026-09-30.md) and incorporates the Worker source supplied in chat. It covers the identified bugs, not a guarantee that every possible bug has been found. No application code, live database records, provider secrets, or deployment settings were changed.

Evidence labels: **Reproduced** means a local test with fake data/mocked dependencies demonstrated the current behavior. **Source-confirmed** means the execution path was inspected but not exercised end-to-end. **Conditional** identifies the trigger needed for the defect to appear.

## Executive assessment

Fix credential disclosure and password-reset account binding first. Next protect conversation history, message retention, and image-generation costs. Then connect the Worker using an explicit API contract. Removing optional UI features alone will not solve these problems.

The September 30 test run reported 1,004 passing tests. That does not cover the failure cases below. This pass rebuilt the server successfully and reproduced five additional cases using `node docs/audit-additional-repro.mjs`. No live AI generation was performed.

## Existing findings still applicable

| ID | Priority | Finding and evidence |
| --- | --- | --- |
| R1 | Critical | User credential testing combines a caller-selected URL with the platform key when no user key is supplied. `server/src/services/ai/providerService.ts:219`. Reproduced in previous audit. |
| R2 | High | Bootstrap stores built-in vendor URLs; credential resolution prioritizes them over the enabled Gateway. `ai/bootstrap.ts:33`, `ai/credentials.ts:227`. Reproduced; previous read-only global DB inspection also found these URLs. |
| R3 | High | Gemini native image/PDF requests ignore custom compatible URLs and can miss Gateway auth, then retry Google directly. `ai/providers/GeminiProvider.ts:52`, `AIProviderManager.ts:545`, `providers/geminiNative.ts`. Reproduced destination/header mismatch. |
| R4 | Medium | Credential-test adapters omit the Gateway authentication token. `ai/providerService.ts:186,225`. Reproduced. |
| R5 | Medium | Startup re-enables existing disabled Gemini models and overwrites catalog display metadata. `ai/bootstrap.ts:55`. Reproduced. |
| R6 | Medium | Analysis jobs remain locally queued: runner response is discarded, no completion polling/callback exists, and chat discards the returned job. `analysis/ExternalAnalysisRunner.ts:35`, `tools/ToolManager.ts:172`. Reproduced. |

Paths abbreviated in this table are under `server/src/services/`. Full explanations and prior verification are in the September report.

## Additional project bugs

### N1 — High: password reset loses account binding

**Reproduced.** `server/src/services/auth/authService.ts:289–304`.

When the submitted email does not resolve to a user, the reset lookup omits `userId`. Any matching active reset code can then select another account through `reset.userId`. The fake-data test supplied a nonexistent email and a matching reset record and observed the other account being changed. A matching active code is still required; this is not a reset-without-code claim.

Fix: require the email's account to exist, bind every code lookup to its ID, and consume codes atomically. Add wrong-email, unknown-email, code-collision, replay, and concurrent-consumption tests. Retain rate limits and generic errors.

### N2 — High: pinning preserves the thread but not its existing messages

**Reproduced update behavior; TTL consequence source-confirmed.** `chat/conversationService.ts:93–95`, `models/Message.ts:39,49`.

Pinning clears only the conversation's `expiresAt`; existing messages retain their TTL dates. MongoDB can delete those messages while the pinned conversation remains. Conversely, unpinning does not give previously non-expiring messages an expiry. New sends also renew the conversation expiry without synchronizing older message dates.

Fix: define one retention policy and apply it consistently to conversation and message rows. Repair existing mismatches; already expired content cannot be restored without backups. Test pin/unpin, resumed chats, and expiry transitions.

### N3 — High: failed regeneration hides existing messages

**Source-confirmed.** `chat/prepareGeneration.ts:315–340`.

Regeneration marks the original answer and later messages superseded before model selection, attachment validation, and tool preparation finish. A failure in those later steps leaves old messages hidden with no replacement.

Fix: validate and prepare before changing the visible branch. Commit branch changes and replacement rows atomically, with a recoverable state for external tool work. Test model-unavailable, attachment failure, image failure, and database failure.

### N4 — Medium: regeneration can use stale branch history

**Source-confirmed, timing-dependent.** `controllers/chatController.ts:157,236`, `chat/streamTurn.ts:138`, `chat/loadHistory.ts:94`.

The controller preloads history while regeneration is superseding the old branch. If the read wins, the model receives discarded messages; replacing the current user message does not truncate the stale branch.

Fix: load regeneration history after the branch commit, or query an explicit immutable branch/version. Test regeneration of an early answer while later messages exist.

### N5 — Medium: regenerated messages omit expiry

**Source-confirmed.** `chat/prepareGeneration.ts:344–352`.

Normal send/edit passes `expiresAt` to `streamingAssistantFields`; regenerate does not. These answers can outlive an expiring conversation.

Fix: use the same retention constructor for send/edit/regenerate, and include existing orphan rows in the retention repair.

### N6 — Medium: pagination skips equal-timestamp messages

**Reproduced query shape.** `chat/conversationService.ts:126,142`.

Sorting uses `(createdAt, _id)`, but the next-page filter uses only `createdAt < cursor.createdAt`. If a page boundary splits messages created in the same millisecond, the next page skips the remaining tied messages.

Fix: use `(createdAt < time) OR (createdAt = time AND _id < cursorId)` with the same sorting direction. Test page size 1 and several same-timestamp records across multiple pages.

### N7 — Medium: “Export all” silently exports a subset

**Reproduced query shape.** `export/exportService.ts:65`; individual message queries also use `.limit(5000)` at line 32.

Archived conversations are excluded and only the latest 200 non-archived conversations are included. The UI does not describe those exclusions. This can mislead someone using export as a backup before account deletion.

Fix: paginate/stream all eligible conversations, include archived chats by default, and explicitly report any output limits. Test 201+ chats, archived chats, and empty chats.

### N8 — Medium: image prompts can trigger a second generation

**Source-confirmed; end-to-end request count not reproduced.** `client/src/hooks/useChatAttachments.ts:60–73`, `client/src/hooks/useChatStream.ts:256–300`, `chat/prepareTurn.ts:81`, `chat/imageIntent.ts:76`.

The toolbar generates an image and attaches it while keeping the draft. Sending the same “generate a picture…” draft runs automatic image detection again, scheduling another generation despite the existing generated attachment. Depending on the selected model/attachment validation, the second request can also fail after the image has already been created.

Fix: use an explicit image action with a request ID and generated-result state. Sending that result should attach it without rerunning generation. Add an exact outbound-call-count test for toolbar → Send and retry.

### N9 — Medium: negated/instructional prompts trigger image generation

**Reproduced.** `chat/imageIntent.ts:58`.

Both “Do not generate an image; just explain the process” and “How can I generate an image using this API?” return true. The detector has no negation/question handling and does not recognize common Roman Urdu creation phrases.

Fix: prefer an explicit image action; if automatic detection stays, require clear generation intent and test negation, quoted text, coding questions, and supported languages. Do not spend image quota for an instructional question.

### N10 — Medium: Flux attachment validation happens after generation

**Source-confirmed.** `client/src/utils/attachmentGate.ts:51`, `chat/prepareTurn.ts:93–123`, `storage/fileService.ts:133`.

The frontend accepts images for image-generation-only selection. The backend runs generation first, then rejects the uploaded image because Flux's capabilities do not include vision. The newly generated file already exists when the request fails.

Fix: validate inputs before external calls. Distinguish text-to-image, image understanding, and image editing; expose only supported combinations.

### N11 — Medium: generated-image attribution can be wrong

**Source-confirmed, configuration/fallback-dependent.** `image/index.ts:40–77`, `image/ImageGenerationProvider.ts:6`, `image/failoverImageProvider.ts:74`.

The image backend comes from global environment settings, not the selected chat model. Every other configured image backend is appended as fallback. Results omit actual producing provider/model, so a Flux-labelled turn can contain a Gemini image. With different environment defaults, even the first attempt can differ from the picker.

Fix: explicit image routing policy and actual provider/model metadata in results, stored files, messages, and usage. Make cross-provider fallback visible/configurable.

### N12 — Medium: image preparation lacks cancellation and explicit deadlines

**Source-confirmed.** All three image provider fetches omit an abort signal. `chat/prepareGeneration.ts:57` performs image work before generation registration; `controllers/chatController.ts:264` installs disconnect handling only after preparation.

A stalled image request can hold preparation open, and stopping/leaving the chat does not reliably cancel that work. The Worker supplied in chat also lacks upstream fetch deadlines.

Fix: create the cancellation/deadline context before preparation, pass it into tools and provider fetches, and share one total retry budget. Install stream heartbeat/disconnect handling before slow preparation.

### N13 — Medium: changing storage backend breaks existing-file routing

**Source-confirmed, triggered by storage migration.** `storage/fileService.ts:75,100–110,182–193`.

File rows record `storageProvider`, but reads/deletes use the currently configured global `storageService`. Switching from local disk to R2/S3 therefore looks for old keys in the new backend unless data is migrated separately.

Fix: resolve storage using recorded provider/configuration version, or perform an explicit verified migration before switching. Test mixed old/new storage records and migration rollback.

### N14 — Medium: local storage deletion hides real failures

**Source-confirmed.** `storage/LocalDiskStorage.ts:27–32`, `storage/fileService.ts:106–110`.

`delete()` suppresses every unlink error, including permission and I/O failures. Callers can remove database metadata and report deletion success while bytes remain on disk.

Fix: ignore only missing-file errors; surface other failures and retain a retryable deletion record. Test missing object versus access-denied failure.

### N15 — Low: deleting chats leaves stale relationship records

**Source-confirmed.** `chat/conversationService.ts:106–110`; `models/Attachment.ts` has no TTL.

Conversation deletion removes messages and the conversation but not its attachment relationships or share records. Those become orphan metadata. Library files may intentionally remain; do not delete shared/reusable file bytes indiscriminately.

Fix: delete dependent relationship/share rows, preserve independently owned Library files, and add an orphan-cleanup migration. Test that files used elsewhere survive.

### N16 — Medium: failed editing can leave a persisted unanswered turn

**Source-confirmed.** `chat/prepareGeneration.ts:198–233`.

Edit creates a new user message and copies attachments before `prepareTurn` validates the model/tools. Preparation failure leaves the appended message behind, without an assistant response or the normal conversation-counter update.

Fix: share the staged/atomic turn-creation flow from N3; keep failed attempts explicit rather than silently partially persisted.

## Worker integration and Worker bugs

The supplied `https://kenai.syedarslanshah7861.workers.dev/` implementation is a **text/vision API, not an image generator**. Root GET 404 is intentional. These findings refer to the supplied source; no authenticated deployed Worker generation was tested.

| ID | Issue | Required correction |
| --- | --- | --- |
| W1 | App uses Bearer auth, `messages/model/stream`, OpenAI-style responses/SSE and GET `/models`; Worker uses `X-API-Key`, `prompt/content`, `{answer, model}`, and rejects GET. | Add a compatible endpoint contract or dedicated adapter. Changing only the URL cannot work. |
| W2 | Worker forwards only one user message, no separate history/system instructions, and provides no streaming. Several text calls fix output to 1,024 tokens. | Support message arrays and roles, bounded requested output, and a documented streaming contract before claiming feature parity. |
| W3 | `callKimiK2` calls Llama 3.2 3B but labels the answer Kimi K2. | Correct model ID/function/label together; return actual provider and model IDs. |
| W4 | Header comment says Cerebras → DeepSeek → Groq; executable order is Cerebras → Groq → DeepSeek → Llama. | One configurable routing list used by execution, documentation, and telemetry. |
| W5 | Cloudflare native `/ai/run` branches only read `result.choices[0].message.content`. Native model documentation lists a `response` text field. | Normalize the documented `result.response` shape and test real recorded schemas; do not confuse native `/run` with OpenAI-compatible `/v1/chat/completions`. |
| W6 | All-provider and vision failure return HTTP 200 with a warning inside `answer`. Upstream errors are silently swallowed. | Return structured non-success status/error codes and safe provider-attempt diagnostics. |
| W7 | No upstream timeout/abort budget; keys/providers are retried sequentially starting at the first key every request. | Bounded deadlines, cancellation, retry classification, key rotation/cooldowns, and a total attempt budget. |
| W8 | Prompt/content has only a truthiness check; every array forces vision. No application-level per-user quota exists in this Worker source. | Validate request types/media/lengths and enforce server-side user quotas; do not embed the shared `CT_AI_KEY` in browser JavaScript. External dashboard controls, if any, were not inspected. |

Cloudflare output references checked in the previous review: [Llama 3.2 3B native output](https://developers.cloudflare.com/workers-ai/models/llama-3.2-3b-instruct/) and [Scout native output](https://developers.cloudflare.com/ai/models/%40cf/meta/llama-4-scout-17b-16e-instruct/). Live availability of the Worker's configured vendor model IDs remains unverified.

Current project image flow is React → Express `/api/tools/images` (or automatic chat tool) → env-selected image provider → Cloudflare Flux, with configured fallback → storage + MongoDB file metadata → authenticated image download. The custom Worker is not in that implementation. Background chat title and summary calls also have their own provider preferences.

## Features to remove, hide, or retain

These are product recommendations for your stated Worker-based setup, not claims that every optional feature is useless.

| Feature | Recommendation | Reason |
| --- | --- | --- |
| Two independent automatic provider routers | Consolidate after Worker integration | Worker and Express choosing/falling back separately makes results and failures difficult to control. |
| Legacy Anthropic provider entry / unsupported choices | Disable and migrate away unless intentionally supported | Previous DB inspection found the row, but the current adapter factory has no Anthropic implementation. |
| Separate toolbar pre-generation plus automatic prompt generation | Merge into one image action | Duplicate UI paths currently allow duplicate API calls. |
| Data analysis | Hide until completed | Its result lifecycle is unfinished; enabling it does not make it usable. |
| Web search and server voice without configured services | Hide unavailable controls or clearly mark setup needed | Missing configuration is not a reason to delete useful implementations. Browser voice still has a fallback. |
| Multi-Agents workspace | Optional development tooling; exclude from production needs | It is not the chatbot's runtime routing layer. Remove only if you do not use its commands. Root checks do not validate this workspace. |
| Notification page for share/export receipts | Optional simplification | Lower value for a small chat product; no functional reason it must be removed. |
| Broad provider-key UI | Hide in a Worker-only product; keep for intentional BYOK mode | It adds complexity and exposes routing choices contrary to Worker-only operation. |
| History, pinning, export, Library/files, image generation | Keep and fix | These are useful capabilities. Their bugs do not make the features unnecessary. |
| Model/title/summary adapters | Keep interfaces; centralize routing | They support maintainability. Route hidden calls through the same explicit policy. |

## Step-by-step fix plan

1. **Close security defects (R1, N1).** Add failing regression tests first. Bind reset codes to accounts and consume once. Prevent platform credentials being sent to user-selected destinations; validate destinations/redirects against internal-network access. Pass tests for wrong/unknown email, concurrent reset, caller URLs, and secret isolation. Check existing exposure evidence before deciding whether key rotation is needed.

2. **Protect conversation data (N2–N7, N16).** Define retention semantics; unify expiry handling; implement lexicographic pagination and complete export. Stage edit/regenerate and atomically commit visible-branch changes. Read branch history after commit. Acceptance: failed operations preserve old content, tied timestamps paginate without loss, pinned messages do not expire, regenerated messages follow retention, archived/201st chat exports correctly.

3. **Prepare narrowly scoped data repairs (R5, N2, N5, N15).** Generate a read-only inventory of expiry mismatches, orphan references, seeded provider URLs and stale providers. Back up affected records; produce a dry-run report. Repair only identified records with idempotent migrations. Do not guess previously disabled model state or claim deleted history is recoverable without backups.

4. **Define the Worker contract (W1–W6, W8).** Preferred target: add OpenAI-compatible `/v1/chat/completions` and `/v1/models` while preserving the existing `X-API-Key` route for existing clients. Support history/system roles, correct model attribution, structured errors and tested native CF response normalization. Keep Worker secrets on Express/Worker only. Decide explicitly whether images stay a separate backend or gain a Worker image endpoint; current Worker cannot generate them.

5. **Centralize application routing (R2–R4, W1, background-call bypass).** One resolver returns final destination, protocol, credential ownership and auth headers. Use it for chat, probes, native media, titles and summaries. Preserve deliberate custom URLs while migrating seeded defaults. Add an explicit Worker-only policy so Auto, attachments, retries and background calls cannot bypass it silently. Verify outbound URLs/headers using mocked fetch.

6. **Make image requests deterministic (N8–N11).** Replace competing generation triggers with an explicit action and idempotency ID. Validate capabilities before generation/storage. Preserve producing provider/model across fallback. Acceptance: toolbar → Send causes one generation; negated/how-to prompts cause none; unsupported image-edit requests fail before external calls; fallback attribution is accurate.

7. **Bound and cancel external work (N12, W7).** Start cancellation and heartbeat handling before preparation, propagate abort signals to tools/providers, and enforce per-attempt plus total deadlines. Classify retryable errors, track key cooldowns, and prevent two routing layers multiplying retries. Test stalled upstream, disconnect, Stop, rate-limit and retry exhaustion.

8. **Repair storage lifecycle (N13–N15).** Route file operations by recorded storage backend/config version or migrate existing objects with checksums before switching. Ignore only ENOENT on deletion; keep durable retries for other failures. Clean orphan relationships while preserving Library files used elsewhere. Test mixed storage, missing files, permission errors, and interrupted migrations.

9. **Complete or hide unfinished features (R6 and feature table).** Leave analysis disabled until jobs persist, finish and return output to chat. Remove misleading unsupported choices. Consolidate redundant image controls and provider menus to match the chosen product mode. Refresh routing docs and settings to describe actual behavior.

10. **Release in small verified changes.** Security → data integrity → routing → images → storage → cleanup. Run relevant regression tests per change, then build/typecheck/lint/full tests and browser flows for login/reset, send/edit/regenerate, image generation, pinning, export and file access. Use staging with controlled live Worker calls to verify auth, SSE, model IDs and media protocols. Review dry-run migrations and rollback steps before production deployment.

## Verification and limits

- Fresh server TypeScript build: passed.
- `node docs/audit-additional-repro.mjs`: five checks passed, demonstrating N1, N2 update behavior, N6 query shape, N7 query shape, and N9. It uses fake users/codes and mocked model methods, blocks outbound fetch, and never connects to MongoDB.
- The reproduction scripts assert current buggy behavior; convert them into desired-behavior regression tests when implementing fixes.
- Earlier results: 1,004 Vitest tests reported passed; build/typecheck passed; one lint warning. The previous PowerShell test wrapper returned exit 1 for test stderr, documented in the earlier audit. These checks were not all rerun during this documentation-only pass.
- Browser E2E, authenticated live Worker calls, external dashboard settings, production telemetry, and every possible concurrency failure were not tested. Race-dependent and migration-dependent findings are identified above.
