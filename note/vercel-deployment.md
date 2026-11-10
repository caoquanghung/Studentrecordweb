# Student Web Vercel Setup

Last verified: 2026-11-10 (Asia/Ho_Chi_Minh).

## Connected project

- Vercel team: `coannoacs-projects` (Hobby).
- Project: `studentweb`.
- Dashboard: <https://vercel.com/coannoacs-projects/studentweb>.
- Stable application URL: <https://studentweb-ruddy.vercel.app> (Vercel-provided domain selected by the owner).
- Git repository: <https://github.com/caoquanghung/Studentrecordweb>.
- Root directory: repository root (`./`); Student Web has its own Git repository.
- Framework: Next.js.
- Node.js: `24.x`.
- Install command: `npm ci`.
- Build command: `npm run build`.
- Output directory: Next.js default.

The local directory is linked through `.vercel/project.json`. `.vercel/` and environment files are ignored by Git. The setup does not change the separate Record Web project.

## Environment variables configured

The following names are configured for Production and Preview:

| Variable | Configuration |
| --- | --- |
| `STUDENTWEB_DEMO_MODE` | `false` |
| `STUDY_ASSIGNMENT_MODE` | `configured` |
| `STUDY_RESERVATION_DURATION_SECONDS` | `1800` |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL` | `/sign-in` |
| `CRON_SECRET` | Separate random secret; value intentionally omitted |

`NEXT_PUBLIC_APP_URL=https://studentweb-ruddy.vercel.app` is configured for Production.

No database or Clerk credentials were copied from Record Web.

## Neon database

- Resource: `studentweb-db`.
- Provider: Neon through Vercel Marketplace.
- Plan: Free (verified from the live resource).
- Resource ID: `store_vS2TFDptWQHUHWgy`.
- Dashboard: <https://vercel.com/coannoacs-projects/~/stores/integration/store_vS2TFDptWQHUHWgy>.
- Connected Vercel environments: Production and Development.
- `DATABASE_URL` and the provider's related connection variables are managed by the integration.
- Local Development variables are synchronized into the ignored `.env.local`; `.env.neon.local` is an additional ignored connection snapshot used during provisioning.
- Verified the database was empty before applying `0001_initial_study`.
- Migration applied successfully and schema verification passed.

Preview is intentionally not connected to the production database. Configure an isolated Neon branch/database for Preview before running database-backed preview deployments. Database race tests still require an isolated test target; the production-connected database was not used as their test target.

The integration also supplied Neon Auth environment variables. Student Web continues to use Clerk; those variables do not configure Clerk authentication.

## Record Web test playlist

- Combination: `841b5e3a-bc7d-888d-8854-50a3c85ded82` (`Record Web playback test`).
- Package: `recordweb-test-841b5e3abc7d588d-v1`.
- Two existing composite MP4 videos, total duration `23.4664` seconds.
- Exact HTTP byte ranges (`206`), content lengths/MIME, CORS for the Student Web origin, and chunk hashes verified.
- Trusted package manifest and manifest SHA-256 stored in the separate Student Web database.
- The combination is disabled with target quota zero; no assignment algorithm has been added or enabled.
- Record Web's database and recording sharing flags were not modified. No Record Web credentials were added to Student Web or Vercel.
- Reproducible provisioning helper: `scripts/import-recordweb-test-combination.mjs` (verification by default, explicit `--apply` for the destination import).
- Full authenticated playback/ZIP browser verification remains pending Clerk configuration and a separately approved assignment test path.

## Pending inputs

1. Choose separate Clerk keys, or explicitly authorize reusing Record Web's Clerk application. Supply keys through an ignored local environment file or Vercel settings, not through chat.
2. Set `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` on the linked Vercel project.
3. Configure Clerk domain/redirects for the selected Vercel URL.
4. The owner deferred the assignment algorithm; keep the current placeholder behavior. A real selector and processed study media are still required for an end-to-end real study.

## Cleanup on Hobby

The incompatible minute-level Vercel cron declaration was removed from `vercel.json`. Hobby rejects that schedule during deployment.

The existing cleanup endpoint is `/api/internal/study-cleanup` and requires `Authorization: Bearer <CRON_SECRET>`. No external scheduler has been provisioned. Configure one at the required cadence, or choose a Vercel plan that supports minute-level cron before enabling the native schedule.

## Deployment status

The initial production deployment is Ready at <https://studentweb-ruddy.vercel.app>.

- Deployment ID: `dpl_2hJMF5i39NBsL4KB9i2hSNFmvace`.
- Inspector: <https://vercel.com/coannoacs-projects/studentweb/2hJMF5i39NBsL4KB9i2hSNFmvace>.
- The Vercel Node 24 production build and TypeScript compilation passed.
- Deployment input verification confirmed all `.env*` files, internal notes, test output and local build caches were excluded by `.vercelignore`.
- Clerk keys are still missing. External checks receive HTTP `503` with `AUTH_NOT_CONFIGURED`, so this is a deployed, access-blocked baseline rather than a usable participant study.
- The owner explicitly deferred the assignment algorithm. Even after Clerk setup, assignment remains `ALGORITHM_NOT_CONFIGURED` until that integration is supplied.

Vercel authentication, project creation, Git connection, build configuration, baseline environment configuration, Neon Free provisioning, database migration/verification, Vercel URL selection, test-media import and initial deployment are complete. Full authenticated participant runtime qualification is pending.

The current local worktree contains implementation changes that are not committed/pushed. CLI deployment can upload the local source; Git-triggered deployments use only the source committed to GitHub.
