# MovieFinder

A feed-first social app for movies and TV, in the style of Instagram and TikTok. Full-height vertical feeds (For You, Following, Explore) scroll through heterogeneous posts: posters, still galleries, cast galleries, trailers, season art, profile photos and member posts. Movies, TV shows, people and members each have an account profile with posts, followers and tabs. Everything is readable signed out; signing in unlocks likes, follows, comments and posting. The interface has no loading spinners.

## Run locally

Requires Bun 1.4.2, a supported Node runtime (22.22.3 used here), Atlas, and the shared platform's installed `vault` wrapper for catalog/auth secrets. PostgreSQL runs locally through [`embedded-postgres`](https://github.com/leinelissen/embedded-postgres); no PostgreSQL installation, Docker, or shared schema allocation is required to run the app.

1. `bun install --frozen-lockfile`.
2. Authenticate using the documented `vault login` workflow. This checkout's `.vault.yaml` selects `personal/dev`.
3. Run `bun run dev`, or choose **Run → MovieFinder** in super.engineering.
4. Open the `http://localhost:<port>` URL printed at startup. Browse signed out, or use **Sign in with Google** from Profile or any interaction prompt. A new MovieFinder account is created automatically on first sign-in.

Startup initializes a local PostgreSQL cluster, creates the local database/schema, applies committed Atlas migrations, and starts both development servers. Both servers use free ports chosen at each start (the URL is printed), and Vite+ proxies API requests to Bun. The database listens only on loopback, uses an available port, and persists under ignored `.local/postgres`. Generated local credentials stay in private ignored `.local/postgres.json`; they never enter Git or Docker build contexts. `bun run telemetry watch --since 5m` shows live bottlenecks while you browse, and `bun run telemetry traces` connects navigation to API, database and provider work; see [observability](docs/observability.md). Stop shuts down the development servers and their PostgreSQL process while retaining your data. A later run reopens the same database.

The local launcher always supplies its own database URL, overriding any shared `DATABASE_URL` injected by Vault. Vault still supplies the real TMDB token and authentication secret. `dev:local` starts the same embedded database when those other variables have already been injected. Shared infrastructure allocation requirements apply only to explicit shared commands and deployment.

Production requires `DATABASE_URL` and the platform-generated `MOVIEFINDER_AUTH_SECRET` (the existing `BETTER_AUTH_SECRET` remains supported for local compatibility); local development generates its database connection and still requires `BETTER_AUTH_SECRET`. Production also requires the app-specific `MOVIEFINDER_ORIGIN`. `TMDB_API_READ_ACCESS_TOKEN` enables catalog refresh; cached content remains usable during an upstream outage. `.env.example` lists variable names without values. Never reuse another application's authentication base URL.

Google is the only sign-in method. Password registration, password sign-in and recovery endpoints are disabled on the backend. Google login uses the shared auth relay, with public `MOVIEFINDER_OIDC_ISSUER` and `MOVIEFINDER_OIDC_CLIENT_ID` settings from an approved relay registration. Both settings are required at production startup. MovieFinder never receives Google credentials or an OIDC client secret. See [Google sign-in setup](docs/auth-relay.md) for registration, exact callbacks, local ports and verification limits.

An existing deployment can accept additional owned HTTPS domains through `MOVIEFINDER_ADDITIONAL_ORIGINS` (comma-separated exact origins). Each hostname keeps its own authentication cookies, callback and CSRF boundary. Production retains `https://moviefinder.chrisvouga.dev` and adds `https://www.moviefinder.app`; the apex redirects to www. See the sign-in guide for both exact registered callbacks.

When registration settings are saved in ignored `.local/auth-relay.json`, ordinary `bun run dev` configures Google automatically and retains the registered port. Live Google-backed sign-in has been verified locally; see the setup guide for registration expiry and renewal requirements.

## T3 Code actions

`t3.json` declares two project actions backed by [`scripts/t3/project.sh`](scripts/t3/project.sh); `mise.toml`/`mise.lock` pin Bun, Node and Atlas, and Bun installs JavaScript dependencies.

- **Setup** runs when T3 creates a worktree: installs the pinned tools with mise, runs `bun install --frozen-lockfile` only when `package.json`/`bun.lock` changed, and initializes and migrates this checkout's embedded PostgreSQL so the first run starts warm.
- **Run app** repeats the (no-op when warm) setup and starts `scripts/dev.ts`. Each checkout uses its own `.local/` database and free ports, so worktrees run side by side. Secrets come from `vault run` when the platform wrapper is installed, otherwise from the same `personal/dev` Vault config through `~/personal`'s `infra-vault run` (override with `PERSONAL_WORKSPACE`). Without either, it starts with a private per-checkout auth secret and no TMDB refresh.
- **Phone access:** Run app prefers web port 5317 and, when Tailscale is running, publishes it to the tailnet only with `tailscale serve --https=5317` (never the LAN or internet). Any device on the tailnet then opens `https://<machine>.<tailnet>.ts.net:5317`; the URL is printed at startup and registered as an additional exact origin. Google sign-in stays on `localhost`, the only registered callback, so browse on the phone signed out. Set `MOVIEFINDER_TAILNET=0` to keep the app local, and run `tailscale serve --https=5317 off` to remove the proxy.

## super.engineering hooks

The repository's `.super.engineering/config.json` provides the built-in hooks:

- **Setup** runs `bun install --frozen-lockfile` when super.engineering sets up the checkout.
- **Run → MovieFinder** is the default. It runs `bun run dev`, loads catalog/auth secrets through Vault, initializes/migrates embedded PostgreSQL, and starts the frontend and backend together. Open the URL it prints.
- **Run → Checks** runs the formatting, lint, native type checking, and unit/property suite with `bun run check`.
- **Run → Database check** checks local database tables/columns, starting embedded PostgreSQL as needed.
- **Run → Migrate database** applies Atlas migrations to embedded PostgreSQL; normal MovieFinder startup already does this automatically.
- **Stop** runs the explicit `scripts/stop-dev.ts` hook for MovieFinder before terminating its Run wrapper. The development supervisor stops both servers and its PostgreSQL process while preserving local data.

Authenticate with `vault login` before Run so catalog/auth secrets are available. Local startup and migrations require no shared allocation flag. The default database commands always target embedded PostgreSQL; shared operations must be invoked explicitly with `:shared` commands and retain the allocation guard.

If an older run reported missing `moviefinder.user` or allocation errors, stop it and start **MovieFinder** again. The embedded database will be initialized and migrated automatically. Existing accounts in other databases are not copied into your local database.

## Commands

| Command                             | Purpose                                                                              |
| ----------------------------------- | ------------------------------------------------------------------------------------ |
| `bun run check`                     | Oxfmt, Oxlint, native TypeScript 7, unit/property tests through Vite+                |
| `bun run format`                    | Format through Vite+                                                                 |
| `bun run lint`                      | Lint through Vite+                                                                   |
| `bun run build`                     | Production React bundle through Vite+                                                |
| `bun run test:integration`          | Isolated embedded PostgreSQL, Atlas migrations, API/concurrency tests                |
| `bun run test:e2e`                  | Isolated embedded PostgreSQL and Playwright mobile/desktop; build first              |
| `bun run test:observability`        | Development browser, API, isolated database, private telemetry files and CLI reports |
| `bun run test:local-database`       | Verify embedded initialization, migrations, persistence, attachment, and shutdown    |
| `bun run db:migrate:shared`         | Apply shared migrations through Vault after explicit allocation approval             |
| `bun run db:validate`               | Validate Atlas migration integrity                                                   |
| `bun run db:check`                  | Check local embedded database tables/columns                                         |
| `bun run db:diff change_name`       | Generate an Atlas migration from atlas/schema.sql                                    |
| `bun run db:migrate`                | Apply local embedded PostgreSQL migrations                                           |
| `bun run db:status`                 | Read local embedded PostgreSQL migration status                                      |
| `bun run db:drift`                  | Compare local embedded PostgreSQL with the desired SQL schema                        |
| `vault run -- bun scripts/smoke.ts` | Explicit live TMDB smoke check; no database writes                                   |

The test scripts refuse non-loopback test URLs or database names that do not end in `_test`. Fixture upstream responses are used only by tests. Production has no mock catalog or authentication bypass.

## UI

All routes use a shared Mantine theme, provider and responsive AppShell. Read
[UI conventions](docs/ui.md) before changing browser code.

## Architecture

One Bun/Hono process serves React, public read APIs, session-protected commands, Better Auth, and SSE. Drizzle queries the allocated `moviefinder` PostgreSQL schema; Atlas owns its migrations. `entity-store` owns source JSON storage and query-time normalization. `entity-store-sync` owns every TMDB request, durable jobs, rate limiting, and refresh policies. TanStack DB query collections hold normalized browser entities and optimistic transactions.

The database retains events in the same transactions as mutations. Replay uses a global ordered cursor; public events reach every visitor and a member's own likes/follows reach only them. A transaction-level PostgreSQL advisory lock makes event identity reflect commit order and serializes counter updates. Catalog posts are derived deterministically from cached TMDB records (`src/shared/posts.ts`), so likes and comments stay attached across refreshes.

See [architecture](docs/architecture.md), [entity store](docs/entity-store.md), [queries](docs/query-system.md), [realtime](docs/realtime.md), [testing](docs/testing.md), and [infrastructure](docs/infrastructure.md).

## Deployment status

The shared inventory records the `moviefinder` service for `crvouga/moviefinder`, its `moviefinder` schema allocation, and `https://moviefinder.chrisvouga.dev`. A production deployment already exists; its health response alone does not verify Google-only sign-in. The inventory checked on 2026-10-25 does not yet include the public OIDC settings required by the new production startup guard. An approved production relay registration and platform configuration are rollout prerequisites. See [infrastructure](docs/infrastructure.md) and [Google sign-in setup](docs/auth-relay.md).

Local development is ready independently of these production allocation requirements. Build the container with `docker build -t moviefinder:verification .`. Runtime secrets are supplied as environment variables, never build arguments. `/health` and all read APIs are public; `/health` is independent of PostgreSQL. `/api/ready`, `/api/metrics` and `/api/command` require a session. See the infrastructure document before attempting rollout.

This product uses the TMDB API but is not endorsed or certified by TMDB. Streaming availability is attributed to JustWatch through TMDB.
