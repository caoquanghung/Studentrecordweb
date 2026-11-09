# Student Web Agent Guidelines

Use English for code, identifiers, comments, tests, and documentation. Participant-facing UI copy may be Vietnamese.

The product source of truth is `document/student-web-specification.md`; the implementation design is `document/student-web-technical-design.md`. Clearly distinguish confirmed protocol rules from proposed engineering defaults.

Core constraints:

- Keep Clerk/database/storage secrets in server code.
- Enforce invitation membership, permissions, ownership, state, and deadlines in server operations.
- Treat quota reservation, start, invalidation, telemetry purge, and completion as database concurrency problems. Do not replace database invariants with process-local locks.
- The 30-minute reservation is persisted state, never a database transaction held open for 30 minutes.
- After Start Study, interruption invalidates the attempt and partial viewing cannot resume.
- Preserve consent and form records while purging invalid viewing telemetry.
- Never permit stale events to recreate purged telemetry.
- Keep large videos and ZIPs out of PostgreSQL and JSON request bodies.
- Never buffer an unbounded lecture package in browser memory.
- Keep recording/capture/compositor/DSP code out of Student Web.
- Production must fail closed when Clerk, database, consent, media, invitation delivery, or assignment configuration is incomplete.

Run meaningful policy, database race, browser lifecycle, build, and lint checks for the affected area. Do not apply migrations to an unknown database automatically.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
