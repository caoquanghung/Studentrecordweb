# Student Web — Technical Design

Version: 0.1 — Proposed implementation design  
Date: 2026-11-09  
Product baseline: [Student Web specification](student-web-specification.md).

This document specifies how to implement the agreed workflow using the same application stack and selected engineering patterns as Record Web. It describes planned work, not functionality already implemented in Student Web. Product protocol decisions still marked Proposed in the baseline remain subject to review.

## 1. Reuse strategy and evidence

Use Record Web's stack and persistence/security patterns. Add a study-specific lifecycle rather than adapting the recording lifecycle directly.

The following source files were inspected for this design. Record Web's `docs/system_architecture.md` is marked stale by its agent instructions and is not used as implementation authority.

| Area | Current Record Web evidence | Student Web application |
| --- | --- | --- |
| Framework and packages | [package.json](../../recordweb/package.json) | Next.js App Router, React, TypeScript; independently locked Student Web dependencies. |
| Request protection | [proxy.ts](../../recordweb/src/proxy.ts) | Clerk proxy plus explicit server authorization in each route. Adapt the route allowlist. |
| Authentication and permissions | [auth.ts](../../recordweb/src/lib/auth.ts), [roles.ts](../../recordweb/src/lib/auth/roles.ts) | Signed identity claims, server permission helpers, explicit resource predicates and 401/403 responses. |
| SQL access | [db.ts](../../recordweb/src/lib/db.ts) | Server-only Neon client and parameterized queries. |
| Schema workflow | [migration guide](../../recordweb/docs/database_migrations.md), [migration directory](../../recordweb/database/migrations) | Ordered immutable SQL migrations and status/migrate/verify commands for Student Web's own database. |
| Attempt lifecycle | [recordingUploads.ts](../../recordweb/src/lib/recordingUploads.ts) | Lease, terminal state, idempotency, atomic completion, and cancellation/tombstone concepts. Use new study tables and durations. |
| Durable cleanup | [adminDeletions.ts](../../recordweb/src/lib/adminDeletions.ts), [cleanup route](../../recordweb/src/app/api/recording-uploads/cleanup/route.ts) | Bounded, authenticated, retryable purge/expiry jobs with durable progress. |
| Local durability | [idb.ts](../../recordweb/src/lib/idb.ts) | IndexedDB queues and form drafts scoped to the signed-in participant. Separate data stores for purge boundaries. |
| Client metadata cache | [cloudLibraryCache.ts](../../recordweb/src/lib/cloudLibraryCache.ts) | Deduplicate reads and prevent stale responses overwriting newer mutations. Do not cache quota decisions as authority. |
| Large downloads | [adminDownloadClient.ts](../../recordweb/src/lib/adminDownloadClient.ts), [adminDownloads.ts](../../recordweb/src/lib/adminDownloads.ts) | Manifest-based direct downloads, streamed ZIP generation, File System Access destination and bounded Blob fallback. |

Record Web's package snapshot at inspection uses Next.js `16.4.2`, React `19.3.0`, Clerk `^7.9.14`, Neon driver `^1.2.0`, Vercel Blob `^2.8.1`, `idb-keyval` `^6.3.0`, `client-zip` `^2.5.1`, TypeScript and Playwright. These are repository observations, not an assertion that they are the latest releases. Match compatible versions when initializing Student Web and commit its lockfile; do not upgrade Record Web as part of this work.

## 2. Proposed stack and boundaries

| Layer | Selected technique | Reason |
| --- | --- | --- |
| Web application | Next.js App Router + React + TypeScript | Same development/deployment model as Record Web. |
| Styling | Vanilla CSS, CSS Modules and CSS custom properties | Reuse token/layout conventions without adding Tailwind or another component framework. |
| Identity | `@clerk/nextjs` | Email authentication and verified server identity. |
| Authorization | Server permission helpers + invitation membership + resource ownership | Authentication alone does not grant study admission or administration. |
| Relational storage | Neon PostgreSQL + `@neondatabase/serverless` | Durable questionnaires, reservations, attempts, event records and quota integrity. |
| Video storage/delivery | Vercel Blob; immutable processed-media references | Reuse the existing storage ecosystem and range-capable delivery. |
| Player | Native `HTMLVideoElement` managed by a study controller | Minimal controls and access to native playback/buffering events. |
| Small local records | IndexedDB via `idb-keyval` and targeted native IndexedDB transactions | Preserve form drafts and unacknowledged telemetry with explicit purge boundaries. |
| ZIP creation | `client-zip` + Streams API | Adapt existing Record Web download techniques. |
| ZIP import | New dependency: `@zip.js/zip.js` | ZIP reading/extraction is needed in addition to the existing archive writer. |
| Large local media | Origin Private File System (OPFS) + Web Worker | Prepare local playback without accumulating whole playlists in JavaScript memory. |
| Small-package fallback | Bounded Blob extraction + object URLs | Capability fallback with an explicit size limit. |
| Integrity | Authoritative manifest + SHA-256 chunk hashes | Validate exact assigned resources with bounded memory. |
| Synchronization | Short HTTPS requests, heartbeats, event batches and idempotency keys | Fits serverless handlers; no permanent application WebSocket required. |
| Hosting | Separate Vercel project for Student Web | Independent releases/environment configuration while retaining the same stack. |
| Verification | Type checking/build, targeted Node tests, PostgreSQL integration tests and Playwright | Verify lifecycle/races and real browser playback behavior. |

No Redis, message broker, ORM, custom Express server, external analytics SDK, or dedicated media server is required by the initial design. Add infrastructure only when measured capacity or media requirements justify it.

Recording-specific capture, `MediaRecorder`, canvas compositing, MediaPipe segmentation, microphone DSP, cursor-capture extension, Electron helper, and client remuxing are not needed for playing already processed lecture videos. Keep the original media bytes and timing; do not recompose or transcode them in the student browser.

## 3. Deployment and data ownership

**Proposed default:** Student Web is an independent application directory and Vercel project, using a separate Neon database and its own migrations. This minimizes accidental coupling between study data and teacher recording tables. A shared database is an alternative requiring an explicit schema/permission plan; do not let both applications independently manage the same migration history.

Receive combinations through a versioned metadata import/adapter. The initial adapter can read validated fixture JSON; the future processing pipeline supplies equivalent metadata. Student Web must not depend on Record Web's private table layout or change original teacher recordings.

Clerk tenant/domain reuse is an environment decision. The code must accept its configured Clerk issuer and enforce Student Web membership independently. Reusing an identity provider does not mean every teacher, developer, or signed-in user is admitted to the study. The same applies to Blob store access: use authorized references to processed content, not a client-visible store credential.

Use a development database/branch and fixture media for tests. Preview deployments must not silently write to the production study database. Place the database and application region with measured participant latency in mind; capacity and region selection require the actual study scale.

### 3.1 Runtime flow

```text
Participant browser
  -> Clerk authentication
  -> Next.js server pages / Route Handlers
  -> invitation, permission and study-state checks
  -> Neon SQL functions / queries

Browser HTML video -> immutable cloud media URL (streaming)
Browser ZIP reader -> worker -> OPFS / bounded Blob -> HTML video (local)
Browser event queue -> authenticated batch API -> Neon telemetry
Authenticated scheduled cleanup -> expiry / invalidation / purge functions
Admin browser -> authorized list/detail/export APIs -> Neon
```

Large cloud video downloads go directly to the media delivery endpoint. JSON endpoints carry only metadata/events/forms. ZIP import is local and does not upload videos back through a Next.js request body.

## 4. Application modules

Proposed layout; names identify responsibilities and are not existing files:

```text
studentweb/
  src/app/
    (auth)/sign-in/
    (student)/study/                 # description, consent, pre-study, preparation
    (student)/study/run/             # stable view: playback and post-study
    (student)/study/complete/
    admin/                         # invitations, combinations, participants, exports
    api/                           # same-origin server operations
  src/components/study/
    StudyRuntimeProvider.tsx
    StudyPlayer.tsx
    StudyPreparation.tsx
    StudyForm.tsx
  src/hooks/
    useStudyController.ts
    useStudyPresence.ts
    useStudyTelemetry.ts
    useMediaReadiness.ts
  src/lib/
    auth/                          # identity, invitations, study permissions
    study/config.ts                # one validated server configuration source
    study/assignment.ts            # selector interface and reservation operations
    study/attempts.ts              # start, heartbeat, invalidate, complete
    study/telemetry.ts             # typed events, validation, deduplication
    study/local-store.ts           # account-scoped IndexedDB access
    media/                         # source adapters, manifest, ZIP and hashing
    db.ts
  src/workers/zip-import.worker.ts
  src/types/                       # shared API/manifest/event contracts
  database/migrations/
  scripts/db-migrate.mjs
  tests/unit/
  tests/integration/
  tests/e2e/
```

`StudyRuntimeProvider` owns one controller, current media element, liveness loop and telemetry queue. Display post-study inside the same stable runtime view instead of tearing down the player/provider through route navigation. Navigating away during the strict period still invalidates the attempt.

Use a typed reducer/state machine for preparation, starting, watching, post-study, completing, invalid and completed. UI components request transitions; they cannot manufacture valid progress. Every critical transition is rechecked by the server. An explicit internal transition flag distinguishes expected video advance/post-study display/completion cleanup from a participant pause or departure.

## 5. Identity, RBAC and invitation techniques

- Adapt `clerkMiddleware`/`src/proxy.ts` for Student Web, with a minimal public-route allowlist. Retain explicit JSON 401/403 behavior for APIs rather than assuming page redirects are suitable.
- Verify the invited email against server-verified Clerk identity. Do not accept a body/query email as identity. Define email canonicalization once; do not invent Gmail-style alias/dot equivalence.
- Store application invitation membership in Student Web's database. A verified user who lacks membership is denied even if Clerk authentication succeeds.
- Use capability names such as `study:participate`, `invitations:manage`, `combinations:manage`, `study-data:read` and `study-data:export` behind a role-to-permission mapping.
- Record Web currently uses `user`/`developer`. Student Web's product roles are student/admin: create an explicit mapping or separate trusted role records. Do not automatically grant study-admin privileges to every Record Web developer without a reviewed mapping.
- Derive elevated roles only from trusted server-managed records or verified signed claims. Resource ownership and invitation membership remain separate checks.
- Reject cross-origin mutations using the same-origin request pattern used by Record Web admin APIs, and retain framework/session protections. Do not use a permissive CORS configuration for study mutation endpoints.
- Keep webhook routes explicitly authenticated by provider signature and cleanup routes authenticated by a server secret. Neither is publicly trusted merely because it bypasses normal user-session middleware.
- Use a unique normalized invitation email within the initial study. Bootstrap the participant idempotently after authenticated acceptance, preserving one pID.

### 5.1 Invitation email delivery

Use an `InvitationEmailProvider` adapter with template version, recipient, study URL, idempotency key and delivery status. Save the authorized email before requesting delivery. A failed send can be retried without creating another authorization or participant.

Provider credentials and the production email provider remain deployment configuration. Development may log a sanitized test delivery result or use a local email stub; it must not report a production invitation as sent when no provider is configured. Provider acceptance, delivery failure and unknown timeout are distinct outcomes. Reusing Clerk authentication does not by itself settle reminder/invitation delivery to accounts that already exist.

## 6. PostgreSQL concurrency design

### 6.1 Transaction boundary with the Neon driver

Record Web uses the HTTP `neon()` query function. HTTP queries and `sql.transaction([...])` support single operations and non-interactive transactions; JavaScript branching inside a long interactive transaction needs a different connection mode. [Neon driver documentation](https://neon.com/docs/serverless/serverless-driver).

**Selected initial approach:** keep the HTTP driver and implement critical lifecycle operations as PostgreSQL functions invoked by one parameterized query. A function performs its locks, current-state reads and writes inside one transaction. Use mutating `VOLATILE` functions and an explicitly tested isolation/snapshot policy (initially Read Committed); acquire capacity locks before subsequent authoritative count reads. This avoids pretending that separate awaited HTTP calls share `BEGIN`/`COMMIT` or retain a row lock.

If future requirements need application-side interactive transactions, introduce a properly scoped `Pool`/`Client` path and test its lifecycle. That is an alternative, not a requirement to add now.

### 6.2 Locking and reservation algorithm

PostgreSQL row locks and transaction-scoped advisory locks provide the proposed primitives. Locks end with the transaction; the 30-minute reservation is a persisted business record, not a database transaction held open for 30 minutes. [PostgreSQL explicit locking](https://www.postgresql.org/docs/current/explicit-locking.html).

Proposed operation:

1. The selector chooses a candidate outside the transaction using current snapshots and the saved pre-study. Record its version; never treat the snapshot as final capacity.
2. Call a reservation SQL function with authenticated pID, candidate, expected content/configuration version and idempotency key.
3. Serialize changes for the participant, using a participant row lock or a transaction-scoped advisory lock when initialization can race.
4. Read the participant's current assignment and identify the old/candidate combination rows. Return an already completed result when appropriate; defer state-changing expiry/replacement until the capacity locks are held.
5. Lock relevant combination rows in a consistent order, then the participant's assignment/attempt rows as needed. Recheck enabled state, content version, current ownership and quota. Normalize this participant's expired state before returning/replacing the current reservation.
6. Count authoritative held/completed rows under the protected capacity boundary. Evaluate effective expiry from server time even when other participants' cleanup rows are still pending. If capacity exists, insert the assignment with database timestamps and a stored original deadline. Otherwise return a conflict/no-capacity result.
7. Commit. On capacity conflict, the caller may invoke the selector again against new snapshots with a bounded retry count.

Start, expiry, invalidation, completion and admin quota updates must follow the same documented lock ordering for all rows they touch. Transactions that touch multiple combination rows lock them in ID order. Do not allow a cleanup worker to acquire locks in the opposite order to an interactive request.

Do not sweep another participant's state by taking their participant lock while already holding a combination lock. Process cleanup per participant in the normal order. Effective capacity reads exclude expired waiting reservations; a stale active attempt still retains its owner's retry capacity while the original reservation deadline is in the future. After that deadline it holds capacity only with a live active lease. Expired leases cannot be renewed or completed by late requests. This permits capacity reuse without either resurrecting a stale attempt or stealing a still-held retry slot.

Initially derive quota counts from authoritative assignment states with indexed queries, rather than maintaining several independent counters. If counters become necessary for scale, update them inside the same lifecycle functions and verify them against authoritative rows.

### 6.3 Constraints and indexes

Proposed schema guards:

- Unique participant identity and invited-email authorization in the initial study.
- Unique current held/active assignment per participant, using explicit persisted lifecycle states.
- Unique active attempt per assignment, unique `(attempt_id, sequence)` and unique event ID.
- Idempotency record keyed by actor, operation and request key; record a request digest so a reused key with different input is rejected.
- Nonnegative quota, valid lifecycle values, required content/form versions and foreign keys.
- Index reservations by state/deadline and combination; attempts by state/lease expiry; telemetry by attempt/sequence; forms by pID/form/version; admin lists by state/combination plus pagination keys.

Do not put a moving `NOW()` predicate into a uniqueness index. Store status transitions explicitly and expire/revalidate inside lifecycle operations. Use database time for deadlines; client countdowns are presentation only. Capture the operation's current time after acquiring the relevant locks (for example using `clock_timestamp()`), so time spent waiting for a lock cannot authorize a start after its real deadline using an old transaction-start timestamp.

### 6.4 Start and completion

`start_attempt` locks/rechecks the assignment, its original deadline, required consent/pre-study, readiness snapshot, and absence of active control. Create a fresh attempt ID and increasing control version. Starting just before expiry protects a valid ongoing run under the baseline's proposed deadline interpretation.

`complete_attempt` verifies the current control version, unexpired connection lease, valid viewing evidence, required event watermark and saved relevant post-study version. It atomically makes the attempt/assignment completed and consumes the completed quota once. Its idempotent result is returned on duplicate completion calls.

Each attempt has a server-issued control credential scoped to its participant/assignment/attempt/version, kept out of URLs and logs. It supplements Clerk identity; possession alone does not authorize another participant. Revocation is a database state/version check, not only client token expiration.

## 7. Cloud playback techniques

### 7.1 Progressive playback first

Use native `<video>` progressive playback from immutable processed media, with a bounded preload of the current/next resource. Vercel Blob supports byte-range downloads; verify actual `206`, range headers, MIME type, codec and cross-origin behavior on fixture and real assets. [Vercel Blob range examples](https://vercel.com/docs/vercel-blob/examples).

Use `preload="metadata"` while preparing the list and request a measured startup buffer before Start Study. A preload attribute is a browser hint, not proof that sufficient bytes are ready. Measure buffered ranges and successful media decode. Keep at most the active and next playback element/resource primed; do not download the full cloud playlist into a JavaScript Blob as an accidental streaming implementation.

No HLS/DASH library or Media Source Extensions pipeline is required initially. If actual processed media and bandwidth measurements require adaptive delivery, add a separately specified transcoding/segmentation output contract. Do not change experimental visual quality or playback speed dynamically without a reviewed study policy.

### 7.2 Media access boundary

Record Web's observed downloads use direct asset URLs. Public Blob URLs can be read by anyone who obtains the URL, whereas private Blob access requires authenticated server delivery. [Vercel Blob access modes](https://vercel.com/docs/vercel-blob).

**Initial proposed delivery:** authorize access to assignment/manifest inside Student Web, then reuse immutable public processed-media URLs for efficient direct playback. This protects admission and result submission, but does not promise that a copied media URL or downloaded ZIP becomes unreadable later.

If invitation-only access must also protect every media byte, select private storage/authenticated delivery before implementation. A private delivery route must enforce ownership and properly forward range/status/length semantics without buffering the entire asset. Never put `BLOB_READ_WRITE_TOKEN` in browser code. Do not assume an HTTP redirect to a public URL creates private storage. [Vercel private storage](https://vercel.com/docs/vercel-blob/private-storage).

### 7.3 Readiness measurement

- Test a noncached representative object on the same delivery path. Use streamed byte counts and `performance.now()` rather than the browser connection hint as the only admission signal.
- Derive the candidate streaming threshold from maximum declared video bitrate multiplied by a configurable safety margin. Supply explicit processed peak bitrate where available; average file-size/duration alone may underestimate peaks.
- Verify first-video buffering and next-resource reachability, codec decode, audible playback setup and server connectivity. Store test age/mode/content version so obsolete readiness cannot authorize a new assignment.
- A failed streaming check still permits ZIP preparation. Both modes require authenticated server connectivity; local mode does not need streaming-level throughput.

### 7.4 Controlled playback and start sequencing

Omit native transport controls and disable application pause/seek/speed/skip/PiP affordances. Observe `playing`, `pause`, `seeking`, `seeked`, `ratechange`, `waiting`, `stalled`, `error`, `ended` and fullscreen/visibility signals. Expected media replacement at a video boundary has an internal transition marker so it is not mistaken for a participant pause.

Validate sequential media-time advancement at 1×. Use `timeupdate`, plus `requestVideoFrameCallback` when supported for sampling decoded media time; throttle telemetry to the configured checkpoint interval. Do not upload frame-by-frame samples or record video frames.

Run a non-experimental sound/playback/fullscreen check during preparation. From the Start Study click, request fullscreen while user activation is available, arm strict monitoring, and request the server start authorization. Do not expose lecture playback until server authorization is granted. Handle every fullscreen and `play()` promise explicitly; a failed authorized start becomes an invalid attempt and returns to preparation without partial credit. Browser policy may reject scripted playback with `NotAllowedError`; an earlier successful sound test is a preflight aid, not a guarantee. [MDN: play()](https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/play).

Use the same media element where practical to avoid unnecessary autoplay-policy changes between videos. Auto-advance cannot silently introduce a manual Play step mid-attempt. If the browser cannot sustain the required conditions, invalidate and offer preparation/retry according to the remaining reservation deadline.

The server checks declared ordering, durations, plausible elapsed time and complete required checkpoints. These are integrity checks over reported playback, not remote attestation or proof of human attention. Browser scripts cannot guarantee resistance to deliberate client tampering.

## 8. ZIP preparation with bounded memory

### 8.1 Download

Adapt Record Web's streamed download flow: obtain an authorized manifest, fetch each required processed resource, and stream `client-zip` output into a File System Access writable opened from a user gesture. Include the exact package manifest. A later pipeline can supply a prebuilt ZIP URL through the same package descriptor.

For browsers without a disk destination, allow a configurable bounded Blob fallback. Record Web currently uses 256 MiB for its fallback; Student Web can start with that proposed cap, rather than assuming it is enough for every playlist. If the package exceeds the supported path, explain this before Start Study and offer a supported browser or cloud mode.

Use actual preparation progress and the original reservation countdown together. Downloading does not renew the slot. After expiry, an old downloaded package is usable only if a new assignment matches its pinned content version.

### 8.2 Import and extraction

`@zip.js/zip.js` provides ZIP readers, stream support and worker integration; bundle a compatible pinned version and its required worker assets. [zip.js documentation](https://gildas-lormeau.github.io/zip.js/).

Proposed import procedure:

1. Read the selected ZIP as a `File`/slice-backed reader. Do not call `arrayBuffer()` on the entire multi-gigabyte archive.
2. Read and size-limit its manifest; compare it with the expected assignment manifest obtained from the authenticated server. The archive's own declaration is not authoritative.
3. Reject duplicate/unsafe paths, excessive entry counts, unexpected files, encrypted/unsupported entries, declared excessive extraction sizes and decompression bombs. Enforce actual streamed output limits as well as header claims.
4. Check storage capacity, then extract one resource at a time in a Web Worker into an attempt-independent preparation directory in OPFS. Abort cleanly on failure/cancel and remove incomplete files.
5. Validate resource byte sizes and chunk hashes during extraction. Mark a package ready only after all required resources are verified and media decoding succeeds.
6. Obtain File-backed playback URLs from validated local resources. Clean up media listeners, worker operations, object URLs and open writers on replacement or unmount.

OPFS is origin-scoped and subject to browser quota; `navigator.storage.estimate()` provides an estimate, not a reservation. Site-data clearing removes it. Ask for persistent storage during preparation where supported, but never promise durable storage simply because a request succeeded. [MDN: OPFS](https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system).

If OPFS is unavailable, a small-package Blob fallback must enforce the configured extracted-byte cap. Do not silently fall back to unbounded RAM. Insufficient disk/storage, unsupported APIs, or corrupt files block local Start Study before any strict attempt begins.

### 8.3 Manifest and integrity contract

Proposed manifest fields:

```text
schemaVersion, combinationId, contentVersion, packageId
videos[]: videoId, sequence, relativePath, mimeType, durationSeconds,
          sizeBytes, integrity
integrity: algorithm = "sha256-chunks-v1", chunkSizeBytes,
           orderedChunkDigests[]
```

The trusted assignment descriptor stores a digest of the exact manifest bytes (or an equivalent versioned canonical representation). A package cannot validate itself by changing both its file and its embedded checksum. Hash/compare the bounded manifest against the authoritative descriptor before trusting its resource list.

Use fixed-size chunks, initially proposed at 4 MiB, and native SHA-256 over each chunk. Validate exact file length, chunk count/order and each digest. The processing/fixture generator must produce this same contract. This is a versioned chunk-integrity format, not a claim that concatenating chunk digests equals a standard whole-file SHA-256.

Native `SubtleCrypto.digest()` requires its input in memory and does not accept a stream. Chunking avoids allocating a whole lecture video for hashing. If the pipeline later requires conventional whole-file SHA-256, add and review an incremental hashing implementation rather than loading the entire file. [MDN: digest()](https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/digest).

### 8.4 Local media versus study data

Prepared lecture files are content, not participant viewing telemetry. Keep their metadata and physical directories separate from attempt event queues. They may be reused when retrying the same combination; a retry must still reset all viewing credit. Clear participant-specific queues on account change and revoke access to another user's pending local records. Do not automatically upload local media or make the website run offline with a service worker.

## 9. Presence, leases and strict monitoring

Use Page Visibility, fullscreen state, focus/blur, page lifecycle events and a stable controller that can issue one invalidation per incident. Register guards before playback starts and keep them through post-study. Fullscreen requires the entire application container, not only the video, because the questionnaire is inside the strict period.

The local first response to a violation is to revoke local playback permission, stop the video, persist a small invalidation marker, clear queued viewing telemetry and request server invalidation. Do not continue playing while waiting for a successful invalidation response.

Send authenticated heartbeats with attempt ID/control version. The server extends only the current valid attempt's connection lease. A stopped browser cannot retain active ownership indefinitely. `navigator.onLine` and offline events are useful hints; successful authenticated API contact and lease validity govern server authority.

Use `BroadcastChannel` or storage notifications to explain that another tab holds control and to clear stale UI. The database remains authoritative across browsers/devices. A second tab cannot take over or advance the first attempt. If opening it hides the active study tab, the ordinary violation rule applies.

On reload/re-entry, query server status before uploading local events. A prior active attempt must be treated as interrupted; do not silently resume it from IndexedDB. A liveness lease is a timeout fallback, not permission to resume partial viewing after a known interruption.

`sendBeacon`/`fetch({keepalive:true})` may send a small same-origin invalidation signal on exit, but they are best-effort only. Keep it small (proposed maximum 16 KiB), never attach a whole queue/video, and rely on server liveness for missed exits. Lifecycle detection retains the limitations documented in [baseline Section 8](student-web-specification.md#8-strict-participation-and-invalid-attempts).

## 10. Telemetry, forms and deletion

### 10.1 Typed events and delivery

Use a discriminated TypeScript event union with runtime payload validation on the server. Shared contracts cover allowed event types, bounded strings, numeric ranges, units and maximum batch bytes. Do not treat TypeScript types alone as request validation.

Event envelope:

```text
eventId, attemptId, assignmentId, controlVersion, sequence,
eventType, clientWallTime, clientMonotonicMs, payload
```

The server supplies pID/combination from authenticated attempt ownership and adds `serverReceivedAt`; do not trust client-provided participant IDs. Use monotonic client time for within-visit durations, wall time for display, and server time for deadlines and commits.

Write events to an account/attempt-scoped IndexedDB queue before normal sending. Use a single producer/sequence allocator per controlled attempt. Send bounded batches periodically and at video boundaries/final submission. Return per-event acceptance/rejection or an unambiguous acknowledged contiguous sequence. Remove only durably acknowledged records. Enforce unique IDs/sequences and reject conflicting reuses rather than overwriting prior payloads.

Retries may resend the same event IDs while the attempt remains valid. A confirmed interruption causes invalidation, not an offline continuation feature. Startup reconciliation purges pending events from invalid attempts before any retry logic runs.

### 10.2 Form durability

Save versioned consent/pre-study and post-study in separate records from viewing events. Store final question answers once per submission; do not upload keystroke streams. Record per-visit form timing and autosave state separately so replay time is not counted as survey-answering time.

Use server-configured JSON form definitions and a renderer with explicit validation for the initial questionnaires. Match form/content versions on submission. Reuse a saved pre-study across assignment expiry and reject attempts to complete using a post-study linked to another combination. Autosaved post-study drafts survive invalidation but do not grant new viewing credit.

### 10.3 Purge protocol and late requests

Inside an invalidation transaction, serialize against telemetry ingestion using the attempt state row, mark it invalid, revoke its version/control, clear progress proof and create any bounded purge job. Ingestion must check/lock that same state boundary before inserting events; a check in one query followed by an unguarded insert in another can race deletion.

Initially delete ordinary-size attempt telemetry synchronously inside the transaction. For large records, mark purge-pending, exclude all of that attempt's events/derived data from reads and exports immediately, then delete in bounded batches. Never expose a partially purged invalid attempt as valid data.

Keep a minimal revocation tombstone so late batches, completed uploads, worker messages or autosave callbacks cannot recreate deleted viewing events. At every asynchronous write boundary, recheck the attempt/content/account identity. Form data is preserved through independent ownership and deletion boundaries.

The operational tombstone/coarse reason remains a product-review item. Do not retain the detailed violation event stream under an alternate operational-log label. Keep request bodies and event payloads out of ordinary application logs.

## 11. Expiry, cleanup and serverless execution

Apply reservation deadlines and connection-lease checks whenever reading current state or attempting assignment/start/heartbeat/completion. Capacity must become reusable when its persisted deadline expires even if no scheduled task has yet updated presentation status. Perform required release/invalidation transitions before allocating that capacity.

Use an authenticated scheduled endpoint for idle-session invalidation, telemetry purge and orphan local-preparation metadata cleanup where applicable. Store progress and claim a short job lease, process a bounded batch, and permit retries. A serverless request or client timer is not an always-running worker.

Record Web's current cron runs daily; do not copy that interval as the only mechanism for 30-minute slot release or active-session invalidation. Select a scheduler/cadence compatible with the deployment plan and the approved cleanup latency. Vercel's legacy Cron limits differ by plan; deployment must verify the available scheduler rather than assuming minute-level execution. [Vercel scheduling limits](https://vercel.com/docs/schedules/cron-jobs/usage-and-pricing).

If a suitable frequent scheduler is unavailable, deadline-aware request processing still preserves admission correctness, but timely physical purge of an abandoned attempt is not guaranteed during complete traffic inactivity. Resolve that operational requirement before real data collection; do not advertise a purge latency that the deployed plan cannot meet.

## 12. Admin queries, cache and exports

- Use server-filtered paginated queries for participant/combination lists. Return a snapshot timestamp and explicit states; avoid downloading all raw telemetry to calculate a dashboard.
- Adapt the per-user cache/deduplication pattern from Record Web for UI reads. Reset it on account/role change and prevent an old GET from overwriting a newer mutation. Reservation/start/completion APIs always read authoritative state.
- Use short configurable polling for admin status initially. No SSE/WebSocket infrastructure is needed for a study dashboard unless its required latency/scale warrants it.
- Render answers as text and format typed values; do not interpret participant text as HTML.
- Stream CSV/JSON exports or paginate them with a consistent cutoff/versioned export definition. A cutoff alone is not a database snapshot: if concurrent mutation prevents a consistent export, fail/restart or use a deliberate snapshot/materialized job rather than silently mixing states.
- Check current purge/validity when exporting; immutable IDs and a versioned schema make missing/deleted data explicit. Previously downloaded exports remain outside live revocation.
- Use UTF-8 CSV with proper escaping and formula-neutralization; keep email mapping a separate explicit export. Include timezone/unit/form/content/algorithm metadata in JSON and a companion export dictionary where CSV needs it.

## 13. API contracts and failure behavior

Proposed routes are illustrative and can be renamed without changing responsibilities:

| Route | Main contract |
| --- | --- |
| `POST /api/participant/bootstrap` | Authorize verified invited identity; return stable pID and workflow state. |
| `POST /api/study/consent` | Save current required permission/consent evidence and version. |
| `PUT /api/study/pre-study` | Validate/save reusable pre-study and timing. |
| `POST /api/study/assignment` | Idempotently return/create a reservation using the selector adapter. |
| `GET /api/study/status` | Authoritative assignment/attempt status, server time and deadline. |
| `GET /api/study/package` | Authorized immutable manifest/package descriptor for the assignment. |
| `POST /api/study/readiness` | Save mode/content-specific, short-lived readiness result. |
| `POST /api/study/attempts` | Atomically start one attempt before the reservation deadline. |
| `POST /api/study/attempts/:id/heartbeat` | Renew valid current connection lease; return server authority/state. |
| `POST /api/study/attempts/:id/events` | Validate bounded event batch, enforce ownership/version and acknowledge committed data. |
| `POST /api/study/attempts/:id/invalidate` | Revoke/purge idempotently; return retry eligibility and original deadline. |
| `PUT /api/study/post-study` | Autosave/submit questionnaire after valid complete viewing; preserve drafts. |
| `POST /api/study/attempts/:id/complete` | Verify viewing, form and event watermark; commit final result once. |
| `GET/POST/PATCH /api/admin/...` | Explicit capability checks, filters/pagination and idempotent invitation/configuration mutations. |
| `GET /api/internal/study-cleanup` | Authenticate scheduler secret; process bounded expiry/purge work. |

Mutation envelopes carry an idempotency key and expected assignment/attempt version as applicable. Return machine-readable error codes such as `INVITATION_REQUIRED`, `NO_CAPACITY`, `RESERVATION_EXPIRED`, `ATTEMPT_INVALID`, `ALGORITHM_NOT_CONFIGURED`, `PACKAGE_MISMATCH` and `SYNC_PENDING` alongside safe user messages.

Use 401 for absent identity, 403 for denied capability/admission, 409 for state/version/capacity conflicts, and 400/422 for invalid request data. Do not leak another participant's identity through object lookup errors. Use `Cache-Control: private, no-store` for sensitive state/forms/data; content caches remain separate and versioned.

## 14. Configuration contract

All values below are proposed engineering defaults except the confirmed 30-minute reservation duration. Calibrate the remaining defaults with real assets before accepting study data. Snapshot protocol-relevant values on an assignment/attempt so a mid-study deployment does not silently change its rules.

| Server setting | Initial value | Behavior |
| --- | --- | --- |
| `STUDY_RESERVATION_DURATION_SECONDS` | `1800` | Confirmed default; applies to new reservations. |
| `STUDY_HEARTBEAT_INTERVAL_SECONDS` | `5` | Active request cadence. |
| `STUDY_CONNECTION_TIMEOUT_SECONDS` | `20` | Fallback liveness expiry, not a resume grace period after a known interruption. |
| `STUDY_TELEMETRY_FLUSH_SECONDS` | `5` | Batch cadence; important transitions also flush. |
| `STUDY_PLAYBACK_SAMPLE_SECONDS` | `1` | Throttled playback checkpoints. |
| `STUDY_TELEMETRY_MAX_BATCH_BYTES` | `262144` | Bound request processing and retries. |
| `STUDY_TELEMETRY_MAX_BATCH_EVENTS` | `100` | Independent count limit. |
| `STUDY_MAX_BUFFERING_SECONDS` | `5` | Proposed maximum continuous system stall; requires protocol approval/calibration. |
| `STUDY_READINESS_TTL_SECONDS` | `120` | Recheck stale readiness before start. |
| `STUDY_STREAM_BITRATE_MARGIN` | `1.5` | Proposed initial margin; not a claim of reliable playback at this multiplier. |
| `STUDY_ZIP_CHUNK_SIZE_BYTES` | `4194304` | Package protocol value; changing it requires a manifest version/config match. |
| `STUDY_LOCAL_BLOB_FALLBACK_MAX_BYTES` | `268435456` | Bound in-memory fallback; archive and extraction limits are separately enforced. |
| `STUDY_ADMIN_POLL_SECONDS` | `10` | Initial dashboard freshness target. |
| `STUDY_ASSIGNMENT_MODE` | `development-stub` or `configured` | Stub must be forbidden for real production studies. |

Define maximum ZIP entry count, expanded bytes/compression ratio, telemetry local-queue size and readiness download/sample sizes after measuring fixture and real playlists; do not invent an unlimited default. Capacity/storage failure must produce a recoverable preparation error or strict-attempt invalidation, never silently discard required data.

Validate configuration at startup. Require timeout > heartbeat interval, positive bounded durations and explicit production selector configuration. Expose only the nonsecret effective public study settings through an authenticated configuration response. Keep `DATABASE_URL`, Clerk secrets, Blob credentials, scheduler secret and email credentials server-only. Never prefix secrets with `NEXT_PUBLIC_`.

## 15. Verification and delivery sequence

### 15.1 Required meaningful checks

| Level | Checks |
| --- | --- |
| Policy/unit | Deadline boundary, retry without renewal, current-role mapping, event schema/size limits, form-version matching and manifest validation. |
| PostgreSQL integration | Last-slot race; duplicate start; expiry versus start; completion versus invalidation; purge versus event insert; stale control token; post-study preservation; quota reduction protection. Use real concurrent connections, not only mocked promises. |
| Browser E2E | Invited/uninvited access, cloud playback, ZIP import/playback, sound/fullscreen/autoplay failure, auto-advance, tab switch/minimize/reload, post-study focus rules, terminal cleanup and account change. |
| Resource behavior | Large archives remain within memory/storage bounds; cancel removes partial extraction; object URLs/workers/listeners close; no whole-playlist RAM buffering. |
| Network behavior | Slow video path versus adequate API path, offline/crash, buffering threshold, dropped ACKs, reordered/duplicate batches and late invalidated events. |
| Admin/export | Authorization, pagination, current counts, valid-only telemetry, CSV escaping, JSON schema and separate identity export. |
| Build/static | TypeScript/Next build and lint using the selected installed versions and their documentation. |

Do not create tests that merely repeat configuration literals. Test state invariants and race outcomes. Use fixture participants/media and isolated database transactions/branches; test helpers must not send real invitations or modify production records.

### 15.2 Implementation order

1. Initialize the independent app, compatible dependencies, CSS tokens, environment validation and Clerk boundary.
2. Add participant/invitation/consent/forms schema and admin invitation/data basics.
3. Implement selector interface, fixture combinations, atomic reservation/start/deadline functions and concurrency checks.
4. Implement the stable player runtime, presence/liveness, typed event queue, invalidation/purge and completion protocol.
5. Qualify cloud readiness/playback, then add ZIP writer/import worker, manifest hashing, OPFS and bounded fallback.
6. Finish post-study preservation, admin monitoring and CSV/JSON export; exercise full lifecycle and failure scenarios.
7. Replace production selector/media/email placeholders and calibrate thresholds against the approved study protocol before collecting real data.

## 16. Decisions still requiring review

This design selects a concrete initial approach while leaving these deployment/protocol choices explicit:

- Separate database/project is proposed; confirm whether infrastructure must be shared with Record Web.
- Confirm Clerk tenant/domain and trusted admin provisioning; do not assume existing `developer` means Student Web admin.
- Confirm whether public processed-media URLs are acceptable or every media byte requires authenticated private delivery.
- Approve/calibrate buffering, liveness, readiness and event sampling settings; they affect which attempts are considered valid.
- Supply the production assignment implementation, processed playlist/package metadata and invitation email provider/configuration.
- Select scheduler capability and acceptable physical-purge latency for inactive traffic periods.
- Resolve baseline protocol review items, including long valid runs after the original start deadline, retained minimal invalidation metadata, and permission/form wording for younger participants.
