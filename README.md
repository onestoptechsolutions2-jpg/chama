# Chama Platform

Multi-tenant SaaS for managing African group-savings associations (chama/SACCO/welfare/self-help groups) — contributions, loans, fines, meetings, welfare claims, table-banking projects, and merry-go-round (MGR) rotations, with M-Pesa collection via IntaSend.

Documentation lives in [`docs/`](./docs/) — read the one that matches what you're doing:
- [`docs/product-plan.md`](./docs/product-plan.md) — who it's for (table banking, boda-boda, welfare/funeral, employee welfare), pricing, what's built.
- [`docs/iam.md`](./docs/iam.md) — identity and access: one person = one phone, the permission matrix, support mode, the agent, the audit log.
- [`docs/architecture.md`](./docs/architecture.md) — current-state technical reference (stack, data model, multi-tenancy/RLS, auth). Start here for anything beyond initial setup.
- [`docs/developer-guide.md`](./docs/developer-guide.md) — conventions for adding a feature, and a list of gotchas that have actually bitten this codebase (read before you rediscover one).
- [`docs/api.md`](./docs/api.md) — every HTTP-facing route and the IntaSend webhook contract.
- [`docs/user-guide.md`](./docs/user-guide.md) — what the app does, written for the people who use it.
- [`docs/CHANGELOG.md`](./docs/CHANGELOG.md) — the full phase-by-phase build history and every real bug found along the way, plus a running list of known gaps.

## Stack

Next.js (App Router) on Vercel, Neon Postgres via Drizzle ORM, Row-Level Security for tenant isolation, DB-backed session cookies, Tailwind + shadcn/ui (Base UI).

## Setup

1. Copy `.env.example` to `.env.local` and fill in:
   - `DATABASE_URL` — Neon connection string for the **owner** role (used only by `drizzle-kit generate`/`migrate`, never by the running app).
   - `APP_DATABASE_URL` — a separate, least-privilege Postgres role the app actually connects as. RLS only works because this role has no `BYPASSRLS`; see `docs/architecture.md`'s Phase 7 notes for exactly how to create it.
   - The rest (`PORTAL_BASE_URL`, `CRON_SECRET`, `STATEMENT_LINK_SECRET`, `INTASEND_*`, `BLOB_READ_WRITE_TOKEN`, and optionally Africa's Talking `AT_*` for SMS, `AGENT_*` for the backend agent, `GOOGLE_*` for Continue with Google) as documented inline in `.env.example`.
2. `npm install`
3. `npm run db:migrate` — applies every migration in `drizzle/`. Vercel runs this automatically before every production build using the owner `DATABASE_URL`, so deployments stop safely if the database cannot be upgraded.
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
- `npm run db:enforce-unique-contacts` — add the one-phone/one-email unique indexes once duplicates are merged (see docs/iam.md).

## Project layout

- `app/` — routes: `(auth)` login/register, `(dashboard)` the authenticated tenant app, `(public)/discover` anonymous group discovery, `super-admin/` the platform-admin console, `api/` webhooks and cron.
- `lib/domain/` — pure, DB-free business logic (loan limits, fines, MGR scheduling, platform fees) — unit-tested without touching Postgres.
- `lib/db/` — Drizzle schema, the pooled client, and the `withTenant`/`withPlatformAdmin`/`withUser` RLS transaction wrappers.
- `drizzle/` — hand-reviewed SQL migrations, including custom RLS policy migrations alongside the generated schema ones.
- `components/ui/` — shadcn primitives; `components/feature/` — everything app-specific.
- `tests/` — Vitest: domain-logic unit tests, seed/membership regression test, and the RLS policy test suite.
