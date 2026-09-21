# ClientFlow

ClientFlow is a lightweight CRM and project management application for freelancers and small
agencies. The core workflow is **User → Client → Project → Task → Dashboard**, with revenue
tracking and dashboard analytics.

> **Project status: Phase 0 (architecture and project setup) is complete.**
> No product features are implemented yet. Authentication, client/project/task management,
> dashboards, demo mode and polish arrive in Phases 1–6.
> The home page is a placeholder that only confirms the foundation runs.

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
- A **Supabase project** — only needed once you work on database-backed features
- A **PostgreSQL 15+ database** with the `auth` stand-in applied — only needed for the Row Level
  Security integration tests (`npm run test:db`)

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
  app/                     App Router entry points (layout, page, globals.css)
  components/ui/           shadcn/ui primitives (button, card)
  lib/
    env.ts                 Validated public environment configuration
    supabase/client.ts     Browser Supabase client (@supabase/ssr)
    supabase/server.ts     Server Supabase client + cookie adapter
  types/database.ts        Database types (temporary scaffold, see below)
supabase/migrations/       SQL migrations applied in filename order
tests/
  unit/                    Vitest unit and component tests
  db/                      Row Level Security integration tests
  e2e/                     Playwright smoke tests
  fixtures/, stubs/        Shared test fixtures
docs/                      Product and phase instructions
```

## Database

### Migrations

Schema changes live in `supabase/migrations/` and are applied in filename order.

The initial migration (`20260921000000_init_clientflow_schema.sql`) creates the four entities of
the product — `profiles`, `clients`, `projects`, `tasks` — together with enums for project status,
task status and priority, indexes, `updated_at` triggers and Row Level Security.

Apply it with the Supabase CLI (recommended) or plain `psql`:

```bash
# Supabase CLI
npx supabase link --project-ref <project-ref>
npx supabase db push

# or, against any PostgreSQL 15+ database
psql "$DATABASE_URL" -f supabase/migrations/20260921000000_init_clientflow_schema.sql
```

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

## Testing

```bash
npm test                            # unit + database suites (Vitest)
npm run test:db                     # Row Level Security integration suite only
npm run build && npm run test:e2e   # Playwright smoke tests against the production build
```

| Suite      | Location     | Covers                                                                          |
| ---------- | ------------ | ------------------------------------------------------------------------------- |
| Unit       | `tests/unit` | environment validation, Supabase client wiring, migration invariants, home page |
| Database   | `tests/db`   | migration + RLS applied to a real PostgreSQL instance                           |
| End-to-end | `tests/e2e`  | shell renders, 404 behaviour, no console errors, mobile layout                  |

The database suite requires `TEST_DATABASE_URL` pointing at a throwaway PostgreSQL 15+ database.
It creates the Supabase `auth` stand-in from `tests/db/bootstrap.sql`, drops and recreates the
`public` schema, applies the migrations and then asserts tenant isolation as the `authenticated`
role (and constraint behaviour with RLS bypassed). If `TEST_DATABASE_URL` is unset the suite is
skipped with a warning — CI always sets it.

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
| 1     | Authentication, profiles, protected routes                            | Not started |
| 2     | Client management                                                     | Not started |
| 3     | Project management                                                    | Not started |
| 4     | Task management and project progress                                  | Not started |
| 5     | Dashboard and revenue calculations                                    | Not started |
| 6     | Demo mode, responsiveness, accessibility, security review, deployment | Not started |

Nothing from Phases 1–6 is implemented: there is no sign-in, no protected route and no CRUD UI.

## Repository notes

- `AGENTS.md` and `CLAUDE.md` are **not** part of this project. `next dev` re-creates them
  automatically when it detects an AI coding agent (see
  `node_modules/next/dist/server/lib/generate-agent-files.js`), so they are listed in `.gitignore`
  to keep the working tree clean.
- `docs/` contains the product brief and phase instructions and is not formatted by Prettier.
