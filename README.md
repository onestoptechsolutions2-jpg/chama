# Chama Platform

Multi-tenant SaaS for managing African group-savings associations (chama/SACCO/welfare/self-help groups) — contributions, loans, fines, meetings, welfare claims, table-banking projects, and merry-go-round (MGR) rotations, with M-Pesa collection via IntaSend.

Full architecture, design decisions, and the phase-by-phase build history (including every real bug found and fixed along the way) live in [`docs/architecture.md`](./docs/architecture.md) — read that first for anything beyond initial setup.

## Stack

Next.js (App Router) on Vercel, Neon Postgres via Drizzle ORM, Row-Level Security for tenant isolation, DB-backed session cookies, Tailwind + shadcn/ui (Base UI).

## Setup

1. Copy `.env.example` to `.env.local` and fill in:
   - `DATABASE_URL` — Neon connection string for the **owner** role (used only by `drizzle-kit generate`/`migrate`, never by the running app).
   - `APP_DATABASE_URL` — a separate, least-privilege Postgres role the app actually connects as. RLS only works because this role has no `BYPASSRLS`; see `docs/architecture.md`'s Phase 7 notes for exactly how to create it.
   - The rest (`CRON_SECRET`, `INTASEND_*`, `PORTAL_BASE_URL`) as documented inline in `.env.example`.
2. `npm install`
3. `npm run db:migrate` — applies every migration in `drizzle/`.
4. `npm run db:seed` — creates one demo group + admin login (prints the credentials).
5. `npm run dev`

## Scripts

- `npm run dev` / `build` / `start` — standard Next.js.
- `npm run lint` — ESLint.
- `npm test` — Vitest (unit tests for `lib/domain/*`, plus DB-backed regression and RLS policy tests — these hit the real database, so they're slower and run as one sequential file group).
- `npm run db:generate` — generate a new Drizzle migration from `lib/db/schema.ts` changes.
- `npm run db:migrate` — apply pending migrations.
- `npm run db:studio` — Drizzle Studio.
- `npm run db:seed` — idempotent demo data seed.

## Project layout

- `app/` — routes: `(auth)` login/register, `(dashboard)` the authenticated tenant app, `(public)/discover` anonymous group discovery, `super-admin/` the platform-admin console, `api/` webhooks and cron.
- `lib/domain/` — pure, DB-free business logic (loan limits, fines, MGR scheduling, platform fees) — unit-tested without touching Postgres.
- `lib/db/` — Drizzle schema, the pooled client, and the `withTenant`/`withPlatformAdmin`/`withUser` RLS transaction wrappers.
- `drizzle/` — hand-reviewed SQL migrations, including custom RLS policy migrations alongside the generated schema ones.
- `components/ui/` — shadcn primitives; `components/feature/` — everything app-specific.
- `tests/` — Vitest: domain-logic unit tests, seed/membership regression test, and the RLS policy test suite.
