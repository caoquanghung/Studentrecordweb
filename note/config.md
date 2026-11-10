# Student Web Configuration Guide

Updated: 2026-11-10 (Asia/Ho_Chi_Minh).

This guide describes the existing deployment and the configuration still needed. The status below reflects the setup verified on this date. Detailed resource and deployment identifiers are recorded in [vercel-deployment.md](vercel-deployment.md).

## 1. Current status

| Area | Status | Configuration |
| --- | --- | --- |
| Website URL | Done | <https://studentweb-ruddy.vercel.app> |
| Vercel project | Done | `studentweb`, team `coannoacs-projects`, Hobby plan |
| Git connection | Done | <https://github.com/caoquanghung/Studentrecordweb>; repository root `./` |
| Build settings | Done | Next.js, Node `24.x`, `npm ci`, `npm run build`, default output directory |
| Initial deployment | Done | Production build and TypeScript compilation passed |
| Neon | Done | Separate Free resource `studentweb-db`, connected to Production and Development |
| Database schema | Done | `0001_initial_study` applied; schema and lifecycle indexes verified |
| Application URL variable | Done | `NEXT_PUBLIC_APP_URL=https://studentweb-ruddy.vercel.app` in Production |
| Test videos | Prepared | Two Record Web composites imported into a disabled playlist with quota `0` |
| Clerk | Pending | Publishable and secret keys have not been configured |
| First administrator | Pending | Provision after Clerk sign-in works |
| Scheduled cleanup | Pending | Secret exists; external scheduler has not been configured |
| Assignment algorithm | Deferred by owner | Keep the explicit placeholder |
| Real study content/forms | Pending before data collection | Approve final media, consent and questionnaire versions |

The last external check returned HTTP `503` with `AUTH_NOT_CONFIGURED` for the website and study/admin APIs. Hosting is deployed; authentication is the immediate access blocker. After Clerk is configured, assignment will still return `ALGORITHM_NOT_CONFIGURED` until its separate implementation is supplied.

## 2. Configure Clerk next

### 2.1 Choose the Clerk application and environment

Choose either a separate Clerk application for Student Web or explicitly reuse Record Web's application. No Record Web Clerk keys have been copied into Student Web.

For the currently selected `*.vercel.app` URL, use a Clerk **development instance** and its matching `pk_test_...` / `sk_test_...` keys for testing. Clerk documents hosted preview domains as a development-key option. [Clerk environments](https://clerk.com/docs/guides/development/managing-environments).

Clerk's production-instance setup requires a domain you own and DNS records you can configure; `*.vercel.app` does not meet that requirement. Using the Vercel URL remains the owner's current testing choice. A later Clerk production rollout will need the corresponding domain setup. [Clerk on Vercel](https://clerk.com/docs/guides/development/deployment/vercel).

Vercel's **Production deployment environment**, Next.js `NODE_ENV=production`, and a **Clerk production instance** are separate concepts. Do not enable Student Web demo identity or change `NODE_ENV` to make hosted authentication work.

### 2.2 Add the keys and redirect configuration

1. In Clerk Dashboard, select the intended application and instance. Enable email sign-in and email verification.
2. Copy both API keys from that same instance.
3. In [Vercel project settings](https://vercel.com/coannoacs-projects/studentweb/settings/environment-variables), add the variables below to the intended environment.
4. Configure the matching site/redirect settings in Clerk for the selected instance.
5. Redeploy Student Web after adding or changing keys. The publishable key is used during the Next.js build. [Clerk deployment guidance](https://clerk.com/docs/guides/development/deployment/production).

```env
# Hosted testing on the current Vercel URL; replace the key placeholders.
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_REPLACE_WITH_YOUR_KEY
CLERK_SECRET_KEY=sk_test_REPLACE_WITH_YOUR_KEY
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_APP_URL=https://studentweb-ruddy.vercel.app

# Keep these values on the hosted deployment.
STUDENTWEB_DEMO_MODE=false
STUDY_ASSIGNMENT_MODE=configured
```

Configure local keys in the existing ignored `studentweb/.env.local`. Use `NEXT_PUBLIC_APP_URL=http://localhost:3000` locally. Preserve the existing Neon variables; do not overwrite this file with `.env.example` now that it contains a real connection.

The server requires a verified **primary email address**. Student participation also requires an invitation in Student Web's own database; sharing Clerk identity with Record Web does not automatically grant study access.

### 2.3 Create the first administrator

The simplest initial path is the Student Web database role:

1. Sign in using the intended administrator's verified email.
2. Visit the app so its authenticated API request creates the `app_users` row. An uninvited account can reach this identity step without being admitted as a participant.
3. In the **Student Web** Neon SQL editor, find that account:

```sql
SELECT id, email, role
FROM app_users
WHERE normalized_email = 'admin@example.com';
```

4. Replace both placeholders below with the verified values, then update that exact account. Expect one returned row.

```sql
UPDATE app_users
SET role = 'admin', updated_at = NOW()
WHERE id = 'user_REPLACE_WITH_THE_CLERK_USER_ID'
  AND normalized_email = 'admin@example.com'
RETURNING id, email, role;
```

5. Refresh the app and open `/admin`.

An alternative is a trusted signed session claim. The role parser accepts `appRole` at the top level or under `metadata`, `publicMetadata`, or `public_metadata`. Setting Clerk public metadata alone is insufficient unless the value is included in the session token. A minimal Clerk session customization is:

```json
{
  "appRole": "{{user.public_metadata.appRole}}"
}
```

Then set the intended user's public metadata to `{"appRole":"admin"}` and refresh the session. Configure this under session-token customization, not merely a separate unused JWT template. [Clerk session-token customization](https://clerk.com/docs/guides/sessions/customize-session-tokens).

If Clerk is shared with Record Web, prefer the Student Web database role for the first administrator: Record Web uses its own `user`/`developer` role values. Do not replace shared role metadata just to grant Student Web administration.

## 3. Environment variables and where they belong

Vercel settings and `.env.local` are separate configuration stores. Editing the local file does not update the hosted deployment.

| Variable | Current hosted state | What to do |
| --- | --- | --- |
| `DATABASE_URL` | Managed by Neon in Production and Development | Keep the existing Student Web connection |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Missing | Add the key for the chosen Clerk instance |
| `CLERK_SECRET_KEY` | Missing | Add the matching secret in Vercel; keep it server-only |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL` | `/sign-in`, Production and Preview | Keep |
| `NEXT_PUBLIC_APP_URL` | Current Vercel URL, Production | Keep; use localhost for local development |
| `STUDENTWEB_DEMO_MODE` | `false`, Production and Preview | Keep for hosted operation |
| `STUDY_ASSIGNMENT_MODE` | `configured`, Production and Preview | Keep; this does not implement the selector |
| `STUDY_RESERVATION_DURATION_SECONDS` | `1800`, Production and Preview | Change only when the protocol changes |
| `CRON_SECRET` | Separate random secret, Production and Preview | Supply it to the selected scheduler securely |

Other policy variables currently use code defaults unless explicitly configured. Their values are listed in Section 6. `NEXT_PUBLIC_*` values are public; database credentials, Clerk secret keys and scheduler secrets must never use that prefix.

The sample also contains `STUDENTWEB_DEMO_ROLE`, which only selects a local demo identity and cannot provision a real administrator. `NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL` is retained in the sample but is not required by this guide; verify the intended return route during the sign-in check.

### Environment separation

- **Production:** deployed at the fixed Vercel URL, with the dedicated Neon database already connected. It is currently a testing deployment with pending Clerk/assignment setup.
- **Development:** `.env.local` was synchronized from Vercel Development. It currently connects to the same new Neon resource as Production. Treat local mutations as writes to that database; create a separate development branch when data isolation is needed.
- **Preview:** intentionally has no database connection. Connect an isolated Neon branch/database before running database-backed preview deployments, then configure its matching Clerk keys and app URL.
- **Database tests:** use an isolated `STUDENTWEB_TEST_DATABASE_URL`. Do not reuse the production-connected database for the destructive fixture lifecycle in the race tests.

Neon also supplied Neon Auth variables. Those do not replace the Clerk keys required by this application.

## 4. Video and combination setup

The current test package is already imported:

| Field | Value |
| --- | --- |
| Combination | `Record Web playback test` |
| Combination ID | `841b5e3a-bc7d-888d-8854-50a3c85ded82` |
| Package ID | `recordweb-test-841b5e3abc7d588d-v1` |
| Content | Two existing Record Web composite MP4 videos |
| Total duration | `23.4664` seconds |
| State | Disabled, target quota `0` |
| Verified | Exact byte ranges, MIME, CORS, file sizes, chunk hashes and manifest digest |

Video URLs remain references to Record Web's existing Blob objects. The source database and recording sharing flags were not changed. Student Web does not need a Blob write token to read these current media URLs, and no Record Web database/storage credentials should be deployed with Student Web.

The playlist remains disabled while assignment is deferred. Raising its quota or enabling it alone will not bypass the assignment placeholder. Browser decoding, strict playback and ZIP end-to-end verification still need a valid authenticated test flow.

When adding more test content, see [the import helper](../scripts/import-recordweb-test-combination.mjs). It verifies selected recordings without writing by default; `--apply` imports a disabled immutable package into Student Web. It supports up to five videos, each at most 32 MiB, for smoke tests.

For real study content, provide immutable combination versions, ordered video metadata, accurate durations/sizes, a ZIP manifest and its integrity data through the future processing pipeline. Keep the source videos available for as long as their assigned content versions are in use.

## 5. Assignment: intentionally deferred

The owner has deferred the assignment algorithm. Keep:

```env
STUDY_ASSIGNMENT_MODE=configured
```

The current `requestAssignment` implementation in [repository.ts](../src/lib/study/repository.ts) returns `503 ALGORITHM_NOT_CONFIGURED` in that mode. The separate PostgreSQL reservation/locking functions and schema already exist, but the production selector adapter has not been supplied.

Do not use `development-stub` as a hosted workaround: production builds reject it, including Vercel Preview builds. The stub is available only for non-production local development. Connecting a real selector or an explicit authenticated test assignment path is later implementation work, not another environment-variable value.

## 6. Study policy settings

These are implemented defaults in [config.ts](../src/lib/study/config.ts), except the client-visible local package setting in [zip-client.ts](../src/lib/study/zip-client.ts).

| Setting | Default | Purpose |
| --- | --- | --- |
| `STUDY_RESERVATION_DURATION_SECONDS` | `1800` | Confirmed 30-minute pre-start slot reservation |
| `STUDY_HEARTBEAT_INTERVAL_SECONDS` | `5` | Active heartbeat cadence |
| `STUDY_CONNECTION_TIMEOUT_SECONDS` | `20` | Server lease expiry after lost contact |
| `STUDY_TELEMETRY_FLUSH_SECONDS` | `5` | Queued event synchronization cadence |
| `STUDY_PLAYBACK_SAMPLE_SECONDS` | `1` | Playback checkpoint interval |
| `STUDY_MAX_BUFFERING_SECONDS` | `5` | Maximum continuous buffering before invalidation |
| `STUDY_READINESS_TTL_SECONDS` | `120` | Preparation result lifetime |
| `STUDY_READINESS_SAMPLE_BYTES` | `1048576` | Representative network probe size |
| `STUDY_READINESS_TIMEOUT_SECONDS` | `15` | Network probe timeout |
| `STUDY_STREAM_BITRATE_MARGIN` | `1.5` | Media bitrate safety multiplier |
| `STUDY_MIN_STREAM_MBPS` | `2` | Minimum server-side streaming admission floor |
| `STUDY_MIN_PLAYBACK_RATIO` | `0.9` | Completion elapsed-time plausibility lower bound |
| `NEXT_PUBLIC_STUDY_MAX_LOCAL_PACKAGE_BYTES` | `4294967296` | OPFS local-package cap: 4 GiB |

The 30-minute reservation is confirmed; remaining thresholds need calibration with actual study media. Connection timeout must exceed heartbeat interval. Playback ratio must be greater than `0` and no greater than `1`.

The existing stored reservation deadline is not extended by a config change, refresh, ZIP download/import or retry. Change the environment setting for future reservations rather than editing the `study_config` table and assuming it drives runtime timing; the current runtime reads these policies from environment variables.

The in-memory ZIP fallback is currently a code constant of 256 MiB. It does not increase when the OPFS environment limit increases. `NEXT_PUBLIC_*` changes require a rebuild/redeploy.

## 7. Configure scheduled cleanup

The current [vercel.json](../vercel.json) has no cron declaration. A one-minute legacy Vercel cron is incompatible with the current Hobby plan, which permits daily cron execution. [Vercel cron limits](https://vercel.com/docs/schedules/cron-jobs/usage-and-pricing).

Choose an external scheduler that can make an HTTPS request every minute and send:

```text
Method: GET
URL: https://studentweb-ruddy.vercel.app/api/internal/study-cleanup
Header: Authorization: Bearer <the existing CRON_SECRET>
```

Use the secret stored on the Student Web Vercel project. Do not put the secret in the URL or this document. If a new secret is generated, update Vercel and the scheduler together, then redeploy.

After Clerk is configured, verify that the correct secret receives `200` with the cleanup result and a missing/incorrect secret receives `401`. Before Clerk setup, the current proxy returns `503` even for the cleanup endpoint.

Request-time reconciliation already enforces deadlines and lease validity. Scheduled cleanup is still needed to process abandoned sessions while the app receives no traffic. Adding an environment variable alone does not schedule a job.

## 8. Invitations and study forms

After the administrator is provisioned, open `/admin/invitations`, invite a test email, check its delivery result and sign in with that exact verified primary email. Invitation delivery currently uses Clerk's invitation API and `NEXT_PUBLIC_APP_URL` for its redirect.

Before collecting real research data, approve the consent/questionnaire content, study contact, institution, retention/sharing policy, withdrawal procedure and any applicable assent/guardian workflow described in [the specification](../document/student-web-specification.md). The form copy is still a draft.

Consent and questionnaire version identifiers are stored in the database's `study_config` row; there are no implemented `CONSENT_VERSION` environment variables. Update the displayed form and persisted version together when publishing an approved revision.

## 9. Deploy and verify

The project is already linked locally. Run commands from `studentweb`:

```bash
npx tsc --noEmit
npm run lint
npm run test:unit
STUDY_ASSIGNMENT_MODE=configured npm run build
npm run test:e2e
```

The build command above supplies the required mode for the local production build. Vercel uses its already-configured environment value. To deploy the current local source:

```bash
npx vercel deploy --prod --scope coannoacs-projects --project studentweb
```

CLI deployment can upload the current worktree. Git-triggered deployments use the committed/pushed GitHub revision. The initial deployment used local source; do not assume every local implementation change is already on GitHub.

After changing Vercel environment variables, redeploy. Confirm the deployment is Ready, open the fixed website URL, verify Clerk sign-in, provision the admin and test an invitation. Full assignment/playback/post-study testing remains pending the deferred assignment integration.

The current database schema is already applied. For a future schema change, verify the target, add a new ordered migration and use:

```bash
npm run db:status
npm run db:migrate
npm run db:verify
```

Do not edit the applied `0001_initial_study` migration or run migrations automatically during every Vercel build.

For guarded database race tests, configure an isolated migrated database through `.env.test`:

```env
STUDENTWEB_TEST_DATABASE_URL=postgresql://REPLACE_WITH_AN_ISOLATED_TEST_CONNECTION
STUDENTWEB_ALLOW_DB_TESTS=true
```

Then run `npm run test:db`.

## 10. Remaining work checklist

- [ ] Select the Clerk application/instance and add matching keys for hosted testing.
- [ ] Redeploy and confirm sign-in works at the Vercel URL.
- [ ] Provision the first Student Web administrator.
- [ ] Verify invitation delivery and invited-email authorization.
- [ ] Configure and verify the external cleanup scheduler.
- [ ] Supply a selector/test assignment integration when the owner resumes that deferred work.
- [ ] Run authenticated cloud playback and ZIP playback through completion/invalidation.
- [ ] Approve final study forms/media and calibrate thresholds before data collection.

For now, no additional Vercel project, Neon database or video upload is required to complete the existing hosted-test configuration.
