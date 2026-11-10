# Student Web

Student Web implements the participant and administrator workflows for the recorded-lecture HCI study described in:

- [`document/student-web-specification.md`](document/student-web-specification.md)
- [`document/student-web-technical-design.md`](document/student-web-technical-design.md)

The application is a Next.js 16/React 19/TypeScript project using Clerk, Neon PostgreSQL, native video playback, IndexedDB telemetry queues, `client-zip`, and `zip.js`. It includes the participant consent/pre-study/assignment/preparation/strict playback/post-study lifecycle and the initial invitation, combination, participant inspection, and CSV/JSON admin features.

This is a runnable implementation baseline, not approval to collect research data. The consent copy is still a draft, and the production assignment algorithm, processed combination metadata, institutional contacts/policy, credentials, and deployment qualification remain explicit integration work.

## Local demo

```bash
cp .env.example .env.local
npm install
npm run dev
```

Open `http://localhost:3000/` for the participant flow and `http://localhost:3000/admin` for the admin workspace.

The default non-production configuration enables a server-backed demo adapter. Its state lives only in the Node process, is reset by a server restart, and does not provide database concurrency or durability. Fixture media and the deterministic first-eligible selector are for workflow rehearsal only.

## Configured mode

1. Create Clerk and Neon development resources; set `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, and `DATABASE_URL`.
2. Set `STUDENTWEB_DEMO_MODE=false`.
3. Apply the schema only to the intended Student Web database:

```bash
npm run db:status
npm run db:migrate
npm run db:verify
```

4. Provision an administrator through a signed Clerk claim using `appRole: "admin"`, or set an existing `app_users.role` to `admin` through a trusted operational process. There is no public admin signup.
5. Configure `NEXT_PUBLIC_APP_URL` so Clerk invitation redirects use the deployed origin.
6. Import immutable combination versions, videos, manifests, byte sizes, and chunk digests from the future processing pipeline. Combinations created in the initial admin UI are disabled placeholders and cannot be enabled while empty.
7. Replace the selector adapter in `requestAssignment`. Set `STUDY_ASSIGNMENT_MODE=configured`; until a real adapter is connected, assignment intentionally returns `ALGORITHM_NOT_CONFIGURED`.

Production builds reject the development selector. Never collect study data with demo mode, fixture media, draft consent text, or an unreviewed assignment adapter.

## Study and media configuration

`STUDY_RESERVATION_DURATION_SECONDS=1800` is the confirmed 30-minute pre-start reservation. Existing assignments retain their stored deadline when the environment value changes. Heartbeat, connection timeout, telemetry flush, playback sampling, buffering, bandwidth, and local-package limits are engineering settings that must be calibrated with the actual lectures.

The ZIP manifest contract is:

```text
schemaVersion, combinationId, contentVersion, packageId
videos[]: videoId, sequence, relativePath, mimeType, durationSeconds,
          sizeBytes, integrity
integrity: algorithm = "sha256-chunks-v1", chunkSizeBytes,
           orderedChunkDigests[]
```

ZIP import validates the server-authoritative manifest, paths, entries, declared and actual expanded size, compression ratio, video metadata, and optional SHA-256 chunk digests. Supported browsers use OPFS for bounded disk-backed extraction; the fallback is capped at 256 MiB. ZIP playback still requires the server connection for heartbeats and telemetry.

Cloud playback uses immutable direct media URLs and range requests. If every media byte must be invitation-protected, add an authenticated private-media delivery path with correct HTTP range behavior before deployment.

### Record Web test media

The provisioning helper `scripts/import-recordweb-test-combination.mjs` reads explicitly selected recording IDs from a separately configured Record Web database and checks their composite video URLs, exact byte ranges, MIME, CORS and SHA-256 chunks. It imports only metadata into Student Web; it does not copy credentials into the application, modify Record Web, or change source sharing flags.

Run from `studentweb` with its own `DATABASE_URL` loaded:

```bash
node --env-file=.env.local scripts/import-recordweb-test-combination.mjs \
  --source-env ../recordweb/.env.local \
  --recording <recording-uuid> --recording <another-recording-uuid>
```

The default verifies without writing. Add `--apply` to import the immutable version. Imports are idempotent for unchanged resources and create a disabled combination with quota zero. The assignment algorithm remains deferred; this helper does not make a playlist automatically assignable. Source files must remain available at their existing Blob URLs. The helper is bounded to five files of at most 32 MiB each for smoke tests.

## Cleanup and exports

The current Vercel team uses Hobby, so `vercel.json` does not declare a minute-level cron (which Hobby rejects during deployment). Configure an external scheduler to call `/api/internal/study-cleanup` every minute with `Authorization: Bearer $CRON_SECRET`, or explicitly select a hosting plan that supports the required cadence before enabling Vercel cron. The endpoint is implemented; no external scheduler is provisioned automatically. Request-time deadline/lease reconciliation preserves admission correctness even when cron is delayed, but timely cleanup during complete traffic inactivity still depends on the scheduler.

Research exports use pID and intentionally omit the email mapping. JSON/CSV include a versioned metadata table, assignments, attempts, forms, valid telemetry, and combination content metadata. Invalid-attempt telemetry is synchronously purged and therefore absent. The live admin participant view remains the authorized place to inspect the email-to-pID relationship.

## Verification

```bash
npx tsc --noEmit
npm run lint
npm run test:unit
npm run build
npm run test:e2e
```

The browser suite targets laptop-sized Chromium. PostgreSQL migration and concurrency tests require an isolated PostgreSQL/Neon test database; do not point them at an unknown or production database.

To run the guarded quota and completion/invalidation race tests, set `STUDENTWEB_TEST_DATABASE_URL` in `.env.test`, apply the migration to that isolated database, set `STUDENTWEB_ALLOW_DB_TESTS=true`, then run `npm run test:db`.

Secrets must remain server-only. Never expose database, Clerk secret, scheduler, email-provider, or storage write credentials through `NEXT_PUBLIC_*` variables.
