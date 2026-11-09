# Student Web

Student Web runs the participant side of the recorded-lecture HCI study described in:

- [`document/student-web-specification.md`](document/student-web-specification.md)
- [`document/student-web-technical-design.md`](document/student-web-technical-design.md)

It uses Next.js, React, TypeScript, Clerk, Neon PostgreSQL, Vercel Blob-compatible media URLs, IndexedDB, and browser ZIP APIs. The application includes participant consent/pre-study/preparation/playback/post-study flows, reservation and attempt lifecycle APIs, telemetry synchronization, and an admin workspace.

## Local development

```bash
cp .env.example .env.local
npm install
npm run dev
```

The default example enables the development-only demo adapter. It is intended for UI and workflow review without external credentials. Demo data lives in process memory and is not a concurrency or persistence guarantee.

Open:

- `http://localhost:3000/` for the participant flow.
- `http://localhost:3000/admin` for the admin workspace. In demo mode, use `?demoRole=admin` if the role switch is shown.

## Configured mode

1. Create Clerk development/production instances and set the publishable and secret keys.
2. Create a Neon database and set `DATABASE_URL`.
3. Set `STUDENTWEB_DEMO_MODE=false`.
4. Apply and verify the database schema:

```bash
npm run db:status
npm run db:migrate
npm run db:verify
```

5. Configure invitation delivery, real immutable combination metadata/media, and the production assignment selector.
6. Set `STUDY_ASSIGNMENT_MODE=configured` before any production build.

The application fails closed in production when the development selector is still configured. Do not collect real study data with draft consent text, fixture combinations, public sample media, or the demo adapter.

## Verification

```bash
npm run test:unit
npm run lint
npm run build
npm run test:e2e
```

Database race tests require an isolated PostgreSQL/Neon test database. Browser checks target laptop-sized Chromium first, matching the initial study requirements.

## Configuration

`STUDY_RESERVATION_DURATION_SECONDS=1800` is the confirmed 30-minute pre-start reservation. Heartbeat, connection timeout, telemetry cadence, buffering, readiness, and package thresholds are engineering configuration and must be calibrated with the real processed lectures before data collection.

Secrets remain server-only. Never expose database, Clerk secret, Blob write, scheduler, or email provider credentials through `NEXT_PUBLIC_*` variables.
