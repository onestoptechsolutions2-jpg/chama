# Developer guide

How to work on this codebase. Read [`architecture.md`](./architecture.md)
first for the system design this guide assumes; see [`api.md`](./api.md)
for the HTTP-facing surface and [`CHANGELOG.md`](./CHANGELOG.md) for why
specific decisions were made.

## Setup

See the [README](../README.md) for the full step-by-step (env vars,
`npm install`, `db:migrate`, `db:seed`, `npm run dev`). One thing worth
repeating here: `DATABASE_URL` and `APP_DATABASE_URL` are **different
Postgres roles against the same database**, not two different databases —
mixing them up either breaks migrations (the app role can't run DDL) or
silently disables every RLS policy (the owner role bypasses RLS). See
[`architecture.md`'s Database roles](./architecture.md#database-roles).

## Conventions for adding a feature

### A Server Action

Colocate `actions.ts` next to the `page.tsx` it serves. Shape to copy from
an existing one (e.g. `app/(dashboard)/dashboard/loans/actions.ts`):

```ts
"use server";
export async function myAction(_prev: State, formData: FormData): Promise<State> {
  const session = await requireRole("admin", "treasurer"); // or requireProduct(...), requireActiveGroup()
  const parsed = myActionSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const groupId = session.activeMembership.groupId;
  const result = await withTenant(groupId, async (tx): Promise<{ error: string } | { ok: true }> => {
    // ... reads/writes, all against `tx` ...
    return { ok: true };
  });

  if ("error" in result) return { error: result.error };
  revalidatePath("/dashboard/whatever");
  return null;
}
```

- One `withTenant`/`withPlatformAdmin`/`withUser` call per logical unit of
  work. If you need several independent queries, either sequence them with
  `await` inside one wrapper call, or give each its **own** wrapper call and
  combine with an outer `Promise.all` — never `Promise.all` *inside* one
  wrapper call. See [`architecture.md`'s wrapper rule](./architecture.md#transaction-wrappers-libdbrlsts) — this has been the single most-recurring bug class in this codebase.
- Validate with Zod (`lib/validation/*.ts`), not ad hoc checks.
- A business-rule threshold (fee %, minimum amount, cap) reads from the
  fetched `group`/`policy` row, never a hardcoded literal — see
  [Adding a group setting](#adding-a-group-setting) below.

### A Route Handler

Only for something a *third party* calls (a webhook, Vercel Cron) or that
needs raw `FormData`/non-JSON body (file upload). Everything else should be
a Server Action — don't build a parallel REST contract for the app's own
UI to call.

### A `lib/domain/*` pure function

No `next/*`, no DB imports, no `"use server"`. Takes already-fetched plain
data in, returns a plain result — the caller (a Server Action or page) does
all the fetching. Add a matching `tests/<module>.test.ts` in the same PR;
every domain module should have one (this codebase has had gaps here before
— `lib/domain/loans.ts`, the fix for the project's own bug #9, went
untested for a long stretch before being caught in a later sweep).

### Adding a group setting

The full path, using a recent real example (`groups.minLoanAmount`):

1. Add the column to `lib/db/schema.ts` (`groups` table) with a
   `.notNull().default(...)` matching whatever the current hardcoded
   behavior is, so no existing group's behavior changes.
2. `npm run db:generate` — see [the drizzle-kit generate
   gotcha](#drizzle-kit-generate-can-produce-a-wrong-diff) below before
   trusting the output blindly.
3. Add the field to the relevant Zod schema in `lib/validation/settings.ts`.
4. Persist it in the matching action in
   `app/(dashboard)/dashboard/settings/actions.ts` (numeric columns need
   `String(value)` — Drizzle's `numeric` type is a string column).
5. Add the input to `components/feature/settings-manager.tsx`'s matching
   tab.
6. Thread it into whatever `lib/domain/*` function actually enforces it —
   as a parameter, not an import of a constant. Give the parameter a
   platform-constant default so existing callers (mainly tests) that don't
   pass one keep working.
7. Update/add the domain function's test to cover the configurable case,
   not just the default.

### `npm run db:migrate`

Applies every pending migration in `drizzle/`. Safe to run against the dev
database at any time — it's additive by construction (see the gotcha below
about hand-trimming a bad diff, but the *apply* step itself is idempotent
and only runs what hasn't run yet). `next build` runs this automatically as
its first step; if you're testing DB-backed code locally (`tests/rls.test.ts`,
`tests/seed-membership.test.ts`, or anything hitting a fresh column), run it
manually first or those tests will fail with "column does not exist" —
that's a migration-not-applied symptom, not a code bug.

## Gotchas that have actually bitten this codebase

Every one of these has caused a real, live bug at least once — several
more than once. Worth internalizing rather than rediscovering.

- **`Promise.all` inside one `withTenant`/`withPlatformAdmin`/`withUser`
  call.** The single most-recurring bug in this project — found and fixed
  independently at least four times, including once in `getSession()`
  itself. See [`architecture.md`](./architecture.md#transaction-wrappers-libdbrlsts).
- **`new Date(y, m, d).toISOString().split("T")[0]`** silently shifts the
  date back a day in any timezone ahead of UTC (this app runs Africa/Nairobi,
  UTC+3) — `toISOString()` always converts to UTC first. Format from local
  components manually instead:
  `` `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}` ``.
  Recurred at least three times (contribution-dues cron, twice in the
  billing feature) before it stopped being a surprise.
- **A raw Postgres GUC (`current_setting`) cast straight to `::int` with no
  empty-string guard.** On a pooled connection, once any transaction has
  touched a custom GUC, a later transaction that never sets it sees `''`,
  not `NULL` — `''::int` throws a hard error instead of the safe "no
  policy matched" you'd expect. Every RLS policy in this schema uses
  `NULLIF(current_setting(...), '')::int` for exactly this reason — copy
  that pattern in any new policy.
- **`INSERT ... RETURNING` under `FORCE ROW LEVEL SECURITY` also requires
  the new row to satisfy a SELECT policy** — not just the INSERT policy's
  `WITH CHECK`. If the row you just inserted wouldn't be visible to a
  SELECT yet (e.g. it's not public, no tenant GUC is set in this
  transaction, and nothing else grants visibility), the whole statement
  throws "new row violates row-level security policy" — the same wording
  as a `WITH CHECK` failure, which makes it easy to misdiagnose. Either
  make sure a SELECT policy already covers the new row's shape, or skip
  `.returning()` and read back what you need another way (`select
  lastval()` for an auto-increment id you just consumed — a session-local
  sequence read, not a table SELECT, so RLS doesn't apply to it at all).
- **Base UI's `Select.Value` renders the raw `value` string, not the
  label**, unless `Select.Root` gets an `items={{ value: label }}` map.
  Every `<Select>` in this app follows this pattern — copy an existing one
  rather than writing a bare `<Select>`.
- **Base UI's `Button` composed with `render={<Link .../>}` stamps
  `role="button"` onto the link**, overriding its correct implicit
  `role="link"`, because `Button` defaults `nativeButton` to `true`. For
  plain navigation styled as a button, use the exported `buttonVariants()`
  class-name function directly on a plain `<Link>` instead — Base UI's
  Button-as-trigger composition is for actual interactive triggers
  (dialogs, menus, sheets), not navigation.
- **A Server Component passing a plain function as a prop into a Client
  Component throws at request time**, not build time or typecheck time —
  "Functions cannot be passed directly to Client Components." Easy to miss
  because `next build`/`tsc` both stay clean; only shows up as a live 500.
  If a chart/presentational component needs a `formatValue`-style callback
  and its caller is a Server Component (does its own `await tx...` fetch),
  either give the callback prop a sensible default so the caller can omit
  it, or make the caller a Client Component if it has no server-only work
  of its own.
- **Zod's `.default()` on a `.transform()`-piped schema applies to the
  *pre-transform* input type**, not the post-transform output — put
  `.default()` before `.transform()` in the pipe.
- **`useSearchParams()` in a client page needs a `<Suspense>` boundary** or
  `next build` fails prerendering with "should be wrapped in a suspense
  boundary." Split the page into an outer default export wrapping an inner
  form component (see `app/(auth)/login/page.tsx`).
- **`drizzle-kit generate` can produce a wrong diff** if the local snapshot
  chain has drifted from what's actually in the migration files (this can
  happen across concurrent branches/sessions touching the schema). It will
  re-propose `CREATE TABLE`/`ADD COLUMN` for things that already exist in
  the live database. Always read the generated SQL file before running
  `db:migrate` — if it's re-creating something you know already exists,
  hand-trim the file down to only the genuinely new statements before
  applying it. Separately, its rename-vs-drop+add disambiguation needs an
  interactive TTY this environment doesn't have — for an actual column
  rename, either run `drizzle-kit generate` interactively yourself, or
  don't rename; keep the old name with a comment explaining what it really
  means now.

## Running & smoke-testing

`npm run dev` starts on port 3000 (falls back to the next free port if
something else is already bound to it — check the terminal output for
which port it actually landed on). There's no dedicated end-to-end suite;
verification has been manual Playwright-driven walkthroughs. If you need
to drive the app in a headless browser: Playwright is already a project
dependency (`node_modules/playwright`), so a plain Node script using
`import { chromium } from "playwright"` works without installing anything
extra — launch, `page.goto()`, `page.fill()`/`page.click()`, and check
`page.on("console"/"pageerror"/"response")` for anything unexpected. Seeded
demo login: `admin@chama.local` / `Admin1234!` (from `scripts/seed.ts`,
overridable via `ADMIN_EMAIL`/`ADMIN_PASSWORD` env vars, idempotent to
re-run).

Note: Server Action redirects can take noticeably longer to land than
`page.waitForLoadState("networkidle")` resolves, especially on a loaded
dev server — don't assume a redirect failed just because the URL hasn't
changed the instant `networkidle` fires; give it a few more seconds before
concluding something's actually broken.

## Deployment

Vercel. `npm run build` = `drizzle-kit migrate && next build` — migrations
run automatically before every production build using the owner
`DATABASE_URL`, so a deploy stops safely (loudly) if the database can't be
upgraded, rather than shipping code against a stale schema. Cron schedules
live in `vercel.json` (UTC times — see [`architecture.md`'s cron
section](./architecture.md#cron-jobs-vercel-cron) for the Nairobi
conversion).

Required env vars beyond the two DB URLs: `CRON_SECRET`,
`INTASEND_SECRET_KEY` + `INTASEND_ENV` + `INTASEND_WEBHOOK_CHALLENGE`,
`BLOB_READ_WRITE_TOKEN`, `PORTAL_BASE_URL` — see `.env.example` for what
each does and where to get it. `/super-admin/integrations` (platform-admin
only) shows live configured/missing status for all of these without
exposing the actual secret values, plus the last 30 inbound webhook events
— check there first when something payment-related isn't working.
