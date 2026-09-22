# ClientFlow

ClientFlow is a lightweight CRM and project management application for freelancers and small
agencies. The core workflow is **User → Client → Project → Task → Dashboard**, with revenue
tracking and dashboard analytics.

> **Project status: Phase 2 (client management) is complete.**
> Email/password accounts, automatic profile creation, server-verified sessions, protected
> routes and full client CRUD are implemented, each with unit, database and end-to-end
> coverage. Project and task management arrive in Phases 3–4, the dashboard metrics in
> Phase 5, and demo mode plus polish in Phase 6.

## Tech stack

| Concern            | Choice                                                      |
| ------------------ | ----------------------------------------------------------- |
| Framework          | Next.js 16 (App Router) with React 19 and TypeScript        |
| Styling            | Tailwind CSS v4 + shadcn/ui primitives                      |
| Database           | PostgreSQL (Supabase) with Row Level Security               |
| Backend client     | `@supabase/ssr` (browser + server clients, cookie sessions) |
| Validation         | Zod                                                         |
| Unit tests         | Vitest + React Testing Library                              |
| End-to-end tests   | Playwright                                                  |
| Linting/formatting | ESLint (flat config) + Prettier                             |
| CI                 | GitHub Actions                                              |

## Prerequisites

- **Node.js >= 20.9.0** (developed against Node 24) and npm
- A **Supabase project** — required for sign-in, registration and anything that reads or writes
  tenant data. Without it the app still runs and explains that authentication is not configured.
- A **PostgreSQL 15+ database** with the `auth` stand-in applied — only needed for the database
  integration tests (`npm run test:db`)

## Getting started

```bash
git clone https://github.com/chengxiaomingcxm/clientflow.git
cd clientflow
npm install

# configure the public Supabase environment variables
cp .env.example .env.local

npm run dev
```

The app is served on [http://localhost:3000](http://localhost:3000).

Before running end-to-end tests for the first time, install the browser binary:

```bash
npx playwright install chromium
```

## Environment variables

All variables are documented in [`.env.example`](.env.example). Real credentials are never
committed: `.env*` is ignored except for the template.

| Variable                        | Required | Purpose                                                                 |
| ------------------------------- | -------- | ----------------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | App      | Supabase project URL                                                    |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | App      | Supabase publishable/anon key (browser-safe, limited by RLS)            |
| `TEST_DATABASE_URL`             | Tests    | PostgreSQL instance used by the RLS integration tests; never production |
| `CLIENTFLOW_E2E_*`              | Optional | Credentials for the live auth E2E suite; see `.env.example`             |

`src/lib/env.ts` validates the public variables lazily and fails with an actionable message.
It also rejects a Supabase **secret** (`sb_secret_*`) or **service-role** key if one is pasted
into a `NEXT_PUBLIC_*` variable, because secret keys bypass Row Level Security and must never
reach the browser.

## npm scripts

| Script                 | What it does                                                   |
| ---------------------- | -------------------------------------------------------------- |
| `npm run dev`          | Starts the development server                                  |
| `npm run build`        | Creates a production build                                     |
| `npm run start`        | Serves the production build                                    |
| `npm run lint`         | ESLint (`next lint` no longer exists in Next.js 16)            |
| `npm run lint:fix`     | ESLint with `--fix`                                            |
| `npm run format`       | Formats the repository with Prettier                           |
| `npm run format:check` | Verifies formatting without writing                            |
| `npm run typecheck`    | Generates route types (`next typegen`) and runs `tsc --noEmit` |
| `npm test`             | Runs all Vitest suites (unit + database, which self-skip)      |
| `npm run test:watch`   | Vitest in watch mode                                           |
| `npm run test:db`      | Runs only the Row Level Security integration suite             |
| `npm run test:e2e`     | Runs Playwright against an **already built** app               |
| `npm run test:e2e:ci`  | Builds and then runs Playwright                                |
| `npm run verify`       | lint → format:check → typecheck → tests → build                |

## Project structure

```
src/
  app/                     App Router
    (auth)/                Public auth pages: /login, /register
    (app)/                 Protected shell plus /dashboard, /clients and /settings
      clients/             /clients, /clients/new, /clients/[clientId], .../edit
    auth/confirm/          Email-confirmation callback (Route Handler)
  components/auth/         Login and register forms, sign-out button, notices
  components/clients/      Client form, client list, delete confirmation
  components/forms/        Form feedback shared by every form (alerts, field errors)
  components/profile/      Profile form
  components/ui/           shadcn/ui primitives (button, card, input, label, alert, textarea)
  lib/
    env.ts                 Validated public environment configuration
    supabase/client.ts     Browser Supabase client (@supabase/ssr)
    supabase/server.ts     Server Supabase client + cookie adapter
    auth/                  Identity, Server Actions, error mapping, redirect safety
    clients/               Client data access, Server Actions, error mapping, form state
    profile/queries.ts     Reads the signed-in user's own profile
    forms/form-state.ts    Generic form primitives (field errors, form values)
    validation/auth.ts     Zod schemas shared by the forms and the Server Actions
    validation/clients.ts  Zod schemas shared by create and edit
  types/database.ts        Database types (temporary scaffold, see below)
  proxy.ts                 Session refresh (Next.js 16 renamed middleware to proxy)
supabase/migrations/       SQL migrations applied in filename order
tests/
  unit/                    Vitest unit and component tests
  db/                      PostgreSQL migration + Row Level Security integration tests
  e2e/                     Playwright tests (auth-live.spec.ts needs a live project)
  fixtures/, stubs/        Shared test fixtures
docs/                      Product and phase instructions
```

## Authentication and profiles

V1.0 supports **email + password** accounts only (no OAuth, magic link, MFA or phone-only accounts).

| Concern                            | Where it lives                                                                       |
| ---------------------------------- | ------------------------------------------------------------------------------------ |
| Session refresh                    | `src/proxy.ts` — rotates Supabase cookies and makes **no** authorization decisions   |
| Authorization boundary             | `src/app/(app)/layout.tsx` — every route in the group requires a verified session    |
| Identity lookup                    | `src/lib/auth/user.ts` — `getUser()` (server-verified), never `getSession()`         |
| Sign in / up / out, profile update | `src/lib/auth/actions.ts` — Server Actions                                           |
| Validation                         | `src/lib/validation/auth.ts` — one Zod schema shared by the form and the action      |
| Safe error messages                | `src/lib/auth/errors.ts` — a fixed message table; upstream text never reaches the UI |
| Redirect targets                   | `src/lib/auth/redirect.ts` — `sanitizeNextPath` prevents open redirects              |
| Email confirmation                 | `src/app/auth/confirm/route.ts` — exchanges the PKCE code in a Route Handler         |

Key properties:

- **Server-first.** Whether a visitor is signed in is decided on the server, and a protected page is
  never rendered for an unverified session. Client-side state is never the gate.
- **Fail closed.** Missing configuration, an unreachable Auth service and an absent session all send
  the visitor to `/login`, which explains which of the three applies. No protected content is
  produced in any of those cases.
- **No account enumeration.** A wrong password and an unknown email produce the same message, and a
  failed sign-up never reveals that an address is already registered.
- **Profiles are created by the database**, not by the browser — see `handle_new_user()` below.
- **No service-role key.** Phase 1 does not need one: authorization comes from the user's own
  session plus Row Level Security.

### Routes

| Route           | Access    | Notes                                                                   |
| --------------- | --------- | ----------------------------------------------------------------------- |
| `/`             | Public    | Landing page with links into the auth flow                              |
| `/login`        | Public    | A signed-in visitor is redirected to `next` (sanitised) or `/dashboard` |
| `/register`     | Public    | Same redirect behaviour                                                 |
| `/auth/confirm` | Public    | Email-confirmation callback; always redirects with `303`                |
| `/dashboard`    | Protected | Minimal authenticated landing page (metrics are Phase 5)                |
| `/settings`     | Protected | Phase 1 profile: shows the email, edits the display name                |

## Database

### Migrations

Schema changes live in `supabase/migrations/` and are applied in filename order.

The migrations are:

1. `20260921000000_init_clientflow_schema.sql` — the four entities of the product (`profiles`,
   `clients`, `projects`, `tasks`), enums for project status, task status and priority, composite
   tenant keys and foreign keys, indexes, `updated_at` triggers and Row Level Security.
2. `20260922000000_add_handle_new_user_trigger.sql` — the Phase 1 profile lifecycle: a trigger on
   `auth.users` that creates the matching `profiles` row (see below).

Apply them with the Supabase CLI (recommended) or plain `psql`:

```bash
# Supabase CLI
npx supabase link --project-ref <project-ref>
npx supabase db push

# or, against any PostgreSQL 15+ database, in filename order
for file in supabase/migrations/*.sql; do psql "$DATABASE_URL" -f "$file"; done
```

### Profile lifecycle

`public.handle_new_user()` is a `SECURITY DEFINER` trigger function with `set search_path = ''`
that inserts the new user's `profiles` row in the same transaction that creates the account:

- A profile cannot exist for a user who does not exist, and cannot be created for somebody else —
  the function only ever writes `new.id`'s own row.
- `full_name` comes from the sign-up metadata, is trimmed, becomes `NULL` when blank, and is
  truncated to the 120 characters the check constraint allows so hostile metadata cannot block
  sign-up.
- `EXECUTE` is revoked from `PUBLIC`, `anon` and `authenticated`, so the function is not reachable
  as an RPC — it can only fire as a trigger.
- Deleting the account cascades and removes the profile.

Because this is a database trigger, a client is never responsible for establishing profile
ownership.

### Tenant ownership model

Every tenant-owned row carries `user_id`, and the relationships are validated by the database, not
only by application code:

| Relationship                   | Guarantee                                                                                       |
| ------------------------------ | ----------------------------------------------------------------------------------------------- |
| `projects(client_id, user_id)` | composite foreign key → `clients(id, user_id)`: a project can only reference its owner's client |
| `tasks(project_id, user_id)`   | composite foreign key → `projects(id, user_id)`: a task can only reference its owner's project  |
| `clients` / `projects`         | `unique (id, user_id)` — the target of the composite foreign keys                               |
| every table                    | `user_id → auth.users(id) on delete cascade` — deleting an account removes its data             |

Client/project deletion is intentionally _not_ cascading: a client that still owns projects cannot
be deleted silently (its composite key uses `NO ACTION`), which forces an explicit decision in the
UI in later phases.

### Row Level Security

RLS is enabled on all four tables and only owner policies exist:

- `USING (user_id = auth.uid())` restricts which existing rows a statement may see or change
  (SELECT, and the old row of UPDATE/DELETE).
- `WITH CHECK (user_id = auth.uid())` validates the new row (INSERT, and the new row of UPDATE),
  which prevents inserting rows owned by somebody else and prevents re-assigning rows to another
  user.
- Child tables additionally check that the parent row belongs to the same user.
- No policies are granted to `anon`, so anonymous requests read and write nothing.
- `service_role` keeps full access for server-side administration and is never exposed to the
  browser.

### Database types

`src/types/database.ts` is a **temporary hand-written scaffold**, because no Supabase project is
linked yet. Replace it with generated types as soon as a project exists:

```bash
npx supabase gen types typescript --linked --schema public > src/types/database.ts
```

## Clients (Phase 2)

`/clients` lists the signed-in user's clients, `/clients/new` creates one, `/clients/[clientId]`
shows one, and `/clients/[clientId]/edit` changes one. Deleting happens from the detail page behind
an explicit confirmation step.

| Concern           | Where it lives                                                                                                |
| ----------------- | ------------------------------------------------------------------------------------------------------------- |
| Routes            | `src/app/(app)/clients/**` — Server Components only, no client-side data layer                                |
| Data access (DAL) | `src/lib/clients/queries.ts` — `listClients`, `getClientById`, `createClient`, `updateClient`, `deleteClient` |
| Server Actions    | `src/lib/clients/actions.ts` — `createClientAction`, `updateClientAction`, `deleteClientAction`               |
| Validation        | `src/lib/validation/clients.ts` — one Zod schema shared by create and edit                                    |
| UI                | `src/components/clients/**` — one form component for both operations                                          |
| Failure mapping   | `src/lib/clients/errors.ts` — fixed, safe sentences; upstream text stays server-side                          |

Design notes:

- **Ownership comes from the session.** The forms submit no `user_id`/`owner_id`; the action reads
  `auth.user.id` after verifying the session and the DAL writes it last, so it cannot be overridden
  by a submitted field. The Zod schema also strips any such field that a tampered request adds.
- **Every statement is owner-scoped.** Reads and writes carry `user_id = auth.uid()` in addition to
  the outer `id` predicate, and Row Level Security enforces the same condition in the database.
- **Not-found semantics are uniform.** A missing client, another tenant's client and a malformed id
  all become `not_found`, which the detail and edit pages render through `notFound()` — a 404 that
  reveals nothing about whether the row exists elsewhere.
- **Delete is a POST**, not a link, and the confirmation is a UI safeguard rather than the security
  boundary: a delete can only ever match a row the caller owns.
- **No new migration.** `public.clients` and its four owner-only policies already existed from
  Phase 0; Phase 2 adds no schema change.

## Testing

```bash
npm test                            # unit + database suites (Vitest)
npm run test:db                     # Row Level Security integration suite only
npm run build && npm run test:e2e   # Playwright tests against the production build
```

| Suite      | Location     | Covers                                                                                                     |
| ---------- | ------------ | ---------------------------------------------------------------------------------------------------------- |
| Unit       | `tests/unit` | env validation, Supabase wiring, Zod schemas, error mapping, redirect safety, Server Actions, proxy, forms |
| Database   | `tests/db`   | migrations + RLS + the profile trigger + client tenant isolation against a real PostgreSQL instance        |
| End-to-end | `tests/e2e`  | protected-route redirects, form validation, open-redirect defence, console errors, mobile layout           |

Phase 2 adds `clients-validation`, `clients-queries`, `clients-actions`, `client-list`,
`client-form` and `delete-client-form` unit suites, the `clients-rls` database suite (tenant A's own
CRUD, tenant B denied on select/update/delete, re-parenting refused, `anon` denied) and
`clients.spec.ts` for the end-to-end flows.

The database suite requires `TEST_DATABASE_URL` pointing at a throwaway PostgreSQL 15+ database.
It creates the Supabase `auth` stand-in from `tests/db/bootstrap.sql`, drops and recreates the
`public` schema, applies the migrations and then asserts tenant isolation as the `authenticated`
role (and constraint behaviour with RLS bypassed). If `TEST_DATABASE_URL` is unset the suite is
skipped with a warning — CI always sets it.

> **`tests/e2e/auth-live.spec.ts` and the `live client management` block of
> `tests/e2e/clients.spec.ts` are NOT VERIFIED AGAINST LIVE SUPABASE.** ClientFlow has no
> Supabase project linked yet, so those blocks skip themselves and report the reason. They require
> `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `CLIENTFLOW_E2E_EMAIL` and
> `CLIENTFLOW_E2E_PASSWORD` (plus the optional `CLIENTFLOW_E2E_OTHER_*` pair for a second tenant).
> Sign-in, sign-out, the profile round-trip, browser-level cross-tenant isolation and the client
> create → detail → edit → delete round trip can only be proven there; the protected-route and
> validation behaviour of the client pages is covered without a project.

## Continuous integration

`.github/workflows/ci.yml` runs four jobs on every push to `main` and on every pull request:

1. **quality** — lint, format check, type check, production build
2. **unit-tests** — Vitest unit suites
3. **database-tests** — PostgreSQL 17 service container, migrations + RLS suite
4. **e2e-tests** — Playwright (Chromium) against the production build

No Supabase credentials are required by CI: the build never talks to Supabase and the database job
provisions its own throwaway PostgreSQL instance.

## Adding UI components

shadcn/ui components are generated, then normalised by Prettier:

```bash
npx shadcn@latest add <component>
npm run format
```

`components.json` uses the current shadcn defaults (`base-nova` style, CSS variables, neutral base
colour), so newly added components stay consistent with the existing primitives.

## Roadmap

| Phase | Scope                                                                 | Status      |
| ----- | --------------------------------------------------------------------- | ----------- |
| 0     | Architecture, tooling, database foundation, RLS, tests, CI            | **Done**    |
| 1     | Authentication, profiles, protected routes                            | **Done**    |
| 2     | Client management                                                     | **Done**    |
| 3     | Project management                                                    | Not started |
| 4     | Task management and project progress                                  | Not started |
| 5     | Dashboard and revenue calculations                                    | Not started |
| 6     | Demo mode, responsiveness, accessibility, security review, deployment | Not started |

Clients are complete: list, empty state, create, detail, edit, confirmed delete, validation,
pending and error states, tenant isolation, unit + database + end-to-end tests and a production
build. Nothing from Phases 3–6 is implemented: there is no project or task CRUD UI, no dashboard
metrics and no demo mode. `/dashboard` is deliberately an empty authenticated landing page.

## Repository notes

- `AGENTS.md` and `CLAUDE.md` are **not** part of this project. `next dev` re-creates them
  automatically when it detects an AI coding agent (see
  `node_modules/next/dist/server/lib/generate-agent-files.js`), so they are listed in `.gitignore`
  to keep the working tree clean.
- `docs/` contains the product brief and phase instructions and is not formatted by Prettier.
