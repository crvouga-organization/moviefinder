# MovieFinder — Complete Autonomous Implementation Specification

## 0. Mission

Build MovieFinder into a complete, production-ready, mobile-first social media app for movies and television, shaped like Instagram or TikTok: everything is centered on scrolling feeds of heterogeneous posts, and movies, TV shows, people and members each have their own account profile.

This is a **full implementation mandate**, not a prototype, proof of concept, scaffold, or architectural proposal.

Implement every feature described in this specification, including the database, external data integration, authentication, social interactions, reactive client state, streaming infrastructure, automated tests, deployment, and operational configuration.

Work autonomously. Do not stop to ask architectural or implementation questions. Make reasonable decisions consistent with this specification and document them. Continue until the application passes its checks and all acceptance criteria are satisfied.

Do not silently omit difficult functionality, substitute mock implementations for production functionality, or claim that unverified behavior works.

Only stop for genuinely external blockers such as unavailable credentials, infrastructure authorization, licensing approval, or permissions that cannot be obtained from the repository or configured integrations. Complete all independent work despite such blockers.

**The primary goal is exceptional mobile UX supported by a simple, correct, highly automated architecture.**

---

# 1. Infrastructure integration — mandatory first step

Before changing application code, read the following documentation in full:

https://www.chrisvouga.dev/llms.txt

This is the authoritative consumer integration guide for the shared infrastructure managed by `crvouga/personal`.

Re-fetch it when performing infrastructure operations rather than relying on a previously saved copy.

Follow its requirements for:

- Vault/OpenBao secrets.
- PostgreSQL access and resource allocation.
- Railway hosting.
- OpenTofu-managed infrastructure.
- Docker and GHCR publishing.
- GitHub Actions and OIDC.
- Cloudflare R2, if necessary.
- Service health checks.
- Deployment conventions.

The OpenTofu inventory in `crvouga/personal` takes precedence if the published integration guide is outdated.

## 1.1 Project-owned resource isolation

MovieFinder must have logically isolated infrastructure resources owned by the MovieFinder application.

Required resources:

- MovieFinder-specific PostgreSQL database or schema allocation.
- Separate development and production configurations.
- MovieFinder-specific authentication data.
- MovieFinder-specific TMDB entity-store tables.
- MovieFinder-specific application data.
- MovieFinder-specific deployment and environment configuration.
- Appropriate secrets and secret access permissions.

**Do not interpret project ownership as permission to create a separate Vault installation, PostgreSQL server, or Railway project outside the shared platform.**

The shared infrastructure remains owned by `crvouga/personal`.

Obtain the app's allocations and configure its integration through that infrastructure's documented OpenTofu workflow.

The infrastructure guide currently specifies:

- Vault: `https://vault.chrisvouga.dev`
- KV v2 paths: `secret/personal/dev` and `secret/personal/prd`
- Application database contract: `DATABASE_URL`
- TMDB credential: `TMDB_API_READ_ACCESS_TOKEN`
- Hosting: managed Railway fleet.
- Container publishing: prebuilt GHCR images.

Use these existing contracts unless the current authoritative documentation specifies otherwise.

Do not create a new Vault namespace merely for naming purposes if that would violate the existing CI/Vault policies.

Verify the actual MovieFinder database allocation before performing DDL or writes. Never assume that possessing `DATABASE_URL` authorizes access to another application's schema.

## 1.2 Existing applications

Inspect the target repository and determine whether the application already exists.

The shared infrastructure inventory may contain existing MovieFinder services.

Do not overwrite, repurpose, or delete existing deployments without verifying their ownership and intended role.

If this work targets an existing MovieFinder application, implement in that repository and migrate it using the architecture defined here.

Do not create duplicate applications or infrastructure merely because an existing deployment has a different technology stack.

## 1.3 Secrets

Use the documented Vault workflow.

Secrets must never be:

- Committed to Git.
- Printed in logs.
- Embedded in frontend bundles.
- Written into Docker images.
- Stored in generated source files.
- Included in CI artifacts.

Use `.vault.yaml` for non-secret connection coordinates.

Local development must load development secrets through the supported `vault run` workflow.

GitHub Actions must use GitHub OIDC to access Vault, not a persistent repository-level Vault token.

Hosted applications must receive runtime secrets through the fleet's OpenTofu inventory.

If Better Auth requires additional secrets, register the required variable names through the documented infrastructure process.

Existing secrets must be reused wherever appropriate.

---

# 2. Mandatory technology stack

Use the following technologies.

| Concern | Technology |
|---|---|
| Language | TypeScript 7, stable native compiler |
| Frontend | React 19 |
| Build and developer tooling | Vite+ |
| Routing | TanStack Router |
| Components | Mantine |
| Styling | Central Mantine theme and component props |
| Feed interaction | Swiper.js |
| Normalized client server-state | TanStack DB |
| Collection fetching | TanStack Query Collections |
| HTTP API | Hono |
| Typed API client | Hono RPC |
| Authentication | Better Auth |
| Runtime | Bun |
| Persistence | PostgreSQL |
| Database access | Drizzle ORM |
| Database migrations | Atlas |
| Validation | Zod |
| Type checking | TypeScript 7 through Vite+ |
| Linting | Vite+ / Oxlint |
| Formatting | Vite+ / Oxfmt |
| Unit/integration tests | Vite+ / Vitest |
| Browser E2E | Playwright |
| External catalog | TMDB |
| Server-to-client updates | Server-Sent Events |

Before installation, verify current stable package versions and official integration guidance.

Use Vite+ as the unified developer interface. Do not create redundant independent linting, formatting, type-checking, or test pipelines.

Use Drizzle for typed PostgreSQL queries, but **Atlas is the exclusive schema migration authority**.

Do not use Drizzle Kit migrations or Better Auth's migration runner.

Keep dependencies minimal. Do not introduce an additional major framework, database, cache service, or message broker without a demonstrated requirement.

---

# 3. Deployment architecture

Deploy the entire application as one Bun server process.

In production:

- Bun runs Hono.
- Hono serves all `/api/*` routes.
- Better Auth owns `/api/auth/*`.
- Hono serves the compiled React application.
- TanStack Router handles client-side navigation.
- SSE connections originate from the same application origin.
- PostgreSQL is the persistent source of truth.

In local development:

- Vite+ serves the React application.
- Vite+ proxies `/api/*` requests to the internal Bun/Hono backend.
- The browser accesses only one origin.
- No development CORS configuration should be necessary.
- One development command starts the complete application.

Use relative API URLs throughout the client.

Production must expose one public HTTP port, provided through `PORT`.

Use a multi-stage Dockerfile compatible with the documented GHCR publishing workflow.

The container must be stateless, restartable, reproducible, and capable of graceful termination.

Do not create separate independently deployed frontend and backend services.

---

# 4. Product principles

The following are non-negotiable.

1. **Mobile-first:** Design for handheld phones before desktop.
2. **No loading spinners:** Never display spinning indicators.
3. **Immediate interactions:** User actions update optimistically.
4. **Progressive data delivery:** Show cached data immediately and enrich it as data arrives.
5. **Open reading:** Every feed, profile, post and search is available to logged-out visitors. Signing in only unlocks interactions (like, follow, comment, post, profile editing).
6. **Public social content:** No private posts, secret profiles, or privacy-toggle systems.
7. **Feed-first:** Every screen leads into scrolling content; accounts are discovered through their posts.
8. **Movies and TV equally supported:** Television is not a secondary feature.
9. **Normalized client state:** All server-derived entities share canonical client collections.
10. **Server-owned external catalog:** TMDB is accessed only through the server.
11. **Cache-first external integration:** PostgreSQL serves cached knowledge before TMDB requests.
12. **Agent-verifiable correctness:** Important behavior must have automated executable tests.

Use the design system to make the UI feel cohesive, polished, responsive, and exceptionally easy to understand.

Avoid generic administration-dashboard aesthetics.

This is a consumer entertainment application.

---

# 5. Authentication and users

Implement Better Auth with PostgreSQL persistence.

Support:

- Registration.
- Login.
- Logout.
- Session restoration.
- Session expiration.
- Google account recovery through Google; no application password recovery.
- Profile editing.
- Display names.
- Usernames.
- Avatars.
- Public profiles.

Google is the sole authentication method, through the shared Google-to-OIDC relay. Create MovieFinder accounts on first verified Google sign-in. Disable application email/password registration, email/username password sign-in and password recovery endpoints. Use Google’s pre-approved button branding. Test authentication with Mockingbird’s Google OAuth emulator.

Do not invent or hardcode provider credentials.

Every application page and read API is public. Logged-out visitors can scroll every feed, open every account profile, read posts and comments and search.

An interaction by a logged-out visitor opens a sign-in prompt and returns them to the same page afterwards.

Operator endpoints (`/api/ready`, `/api/metrics`) and all commands require a session.

No private-account or private-post functionality is required.

Authentication and authorization remain separate:

- Reading public content requires nothing.
- Liking, following, commenting and posting require a session.
- Editing a profile, deleting a post or deleting a comment requires ownership (a post's author may also remove comments on it).

Enforce authorization on the backend, never only through hidden UI controls.

---

# 6. Global client entity state

TanStack DB must be the authoritative client-side home for server-derived application entities.

Create typed collections for:

- Movies.
- TV series.
- Seasons.
- Episodes.
- People.
- Credits.
- Genres.
- Users.
- Posts.
- Comments.
- Post engagement counters.
- Account audience counters.
- The viewer's likes and follows.

Each entity must have a canonical identity.

For TMDB records, use a compound source identity such as:

`tmdb:movie:123`

`tmdb:tv:456`

`tmdb:person:789`

Relationships should reference canonical IDs instead of duplicating complete entities.

Different views of the same entity must observe the same underlying state.

Use reactive live queries for derived views.

Do not maintain disconnected copies of server-derived state in component-local React state, context providers, or unrelated query caches.

Local component state is appropriate for transient UI details such as whether a sheet is open.

TanStack DB query collections must integrate with Hono RPC and the application's incremental SSE protocol.

Mutations must:

1. Apply an optimistic client update.
2. Send a typed authenticated command.
3. Commit the authoritative server change.
4. Reconcile with the server response.
5. Correctly revert or resolve conflicts if the command fails.

Preserve correctness across reconnects and duplicate event delivery.

---

# 7. Feeds of heterogeneous posts

The primary experience is a full-height, vertically swipable TikTok-style feed built with Swiper.js.

A post is the unit of content. Posts are heterogeneous:

- Image posts (posters, backdrops, profile photos, season art).
- Galleries (stills, alternative posters, cast photos linking to each person, "known for" posters linking to each title), swiped horizontally inside the vertical feed.
- Videos (trailers, teasers and clips), shown as artwork with tap-to-play; never autoplay.
- Text posts and member posts with attached artwork.

Catalog accounts publish posts derived deterministically from their cached TMDB source record, so a post keeps its identity, likes and comments across refreshes. Provider summaries yield artwork posts; hydrated details add trailers, galleries, cast and seasons. Members publish stored posts that may tag one movie, show or person and attach that account's artwork.

Feeds:

- **For You:** provider trending (or topic-filtered popular) pages expanded into each account's featured posts, with recent member posts woven in. Topic chips select All, Movies, TV or a genre.
- **Following:** posts from followed movies, shows, people and members, plus member posts tagging followed accounts. Signed-out visitors see a sign-in invitation.
- **Explore:** a three-column grid of popular posts by topic plus account search. A grid tile opens the same posts as a vertical feed starting at that post.

Each feed slide shows the media, the author's avatar, like/comment/share actions with counts, and the caption with tagged accounts.

Implement:

- Virtualized slides (never thousands of DOM nodes).
- Stable slide dimensions and reserved media frames.
- Cursor pagination that loads before the feed is exhausted.
- Append-only ordering: posts already presented never move when later pages or late provider results arrive.
- Preservation of position after navigating to a profile or post and back.
- Deduplication of posts within a feed session.

# 8. Accounts and profiles

Movies, TV shows, people and members are all accounts with Instagram/TikTok-style profiles:

- Avatar, cover artwork, name, handle or kind/year.
- Post, follower and (for members) following counts.
- Follow button (or Edit profile and Sign out on one's own profile).
- Overview/biography and facts (year, runtime, seasons, rating, genres, birthplace).
- Tabs: Posts, Videos, Community (member posts tagging the account), Cast and Related for titles, Credits for people, Likes for members.
- Grid tiles open the tab as a vertical feed starting at the tapped post.

Every relationship is navigable: cast to person accounts, credits and related titles to title accounts, gallery items to the linked account.

# 9. Interactions

Signed-in members can:

- Like and unlike any post.
- Follow and unfollow any account.
- Comment on any post and delete their own comments (post authors may remove comments on their posts).
- Create posts with a caption, an optional tagged movie/show/person and up to ten of its images; delete their own posts.
- Edit their public profile.

Interactions update optimistically and reconcile with the server. Likes and follows toggle: an undo is a newer inactive version, never a removal that a late event could resurrect. Counters are maintained transactionally with the change and can never go negative. Duplicate operation IDs replay the original result; reusing an ID for a different command is rejected.

# 10. Real-time behavior

Committed changes stream through SSE to every visitor. Counters, posts and comments are public events; a member's own likes and follows are delivered only to that member.

Support reconnection, duplicate delivery and replay from a cursor; if the cursor is too old, send a consistent snapshot and resume.

Persist each mutation and its ordered events in the same transaction.

# 11. Comprehensive account details

Title and person details remain comprehensive; they now appear as profile facts, tabs and posts rather than a separate details page.

Implement polished, information-rich detail screens for both movies and television.

### Movie details

Include, where available:

- Poster and backdrop.
- Title and original title.
- Synopsis.
- Release dates.
- Runtime.
- Genres.
- Ratings and vote counts.
- Popularity.
- Original language.
- Production companies.
- Countries.
- Keywords.
- Cast.
- Crew.
- Directors.
- Writers.
- Related and recommended titles.
- Collection/franchise relationships.
- External identifiers and supported links.
- Trailers and videos.
- Follow and community posts.

### TV details

Support all appropriate shared title fields plus:

- Series status.
- Networks.
- Creators.
- First and latest air dates.
- Number of seasons.
- Number of episodes.
- Season navigation.
- Episode navigation.
- Episode descriptions.
- Episode air dates.
- Guest stars.
- Episode-specific credits where available.
- Related series.

### People details

Implement navigable person pages with:

- Name.
- Biography.
- Profile image.
- Known-for titles.
- Filmography.
- Acting credits.
- Directing credits.
- Writing and other crew credits.
- Related navigational links.

All relationships must be navigable.

Clicking a cast member, director, series, season, episode, or related film should lead to its appropriate details.

Prefer existing cached relationships and progressively hydrate missing information.

Use clear placeholders for absent upstream metadata rather than invented content.

---

# 12. TMDB entity-store subsystem

This is the most technically demanding part of the application.

Implement it as two distinct modules:

**`entity-store`**

Owns durable storage and retrieval of externally sourced entities.

**`entity-store-sync`**

Owns ingestion, refresh, incremental replication, and synchronization with TMDB.

All TMDB API access must flow through the synchronization module.

Individual application features must not issue arbitrary TMDB fetches.

## 12.1 Source-oriented storage

PostgreSQL stores a continuously refreshed, selective replica of TMDB information.

Preserve source documents primarily in JSONB.

Each stored source record should track:

- Provider.
- Entity type.
- External entity ID.
- Source payload.
- Payload schema/version metadata where applicable.
- Fetch timestamp.
- Refresh deadline.
- Source revision or checksum.
- Last successful refresh.
- Last failed refresh.
- Error state where necessary.

Deduplicate source records by canonical identity.

Update records transactionally.

Avoid eagerly transforming all incoming TMDB content into a large relational catalog.

### Query-time normalization

Normalization occurs when the application reads entities for a specific use case.

Keep raw provider data separate from application-facing normalized projections.

Use typed normalizer functions for:

- Movie.
- TV series.
- Season.
- Episode.
- Person.
- Credits.
- Genres.
- Images.
- Relationships.

Normalizer functions should be deterministic and unit-testable.

They must tolerate incomplete and changing source payloads.

Preserve unknown or nullable source fields safely.

Use source schema validation at ingestion boundaries.

### Necessary indexes

Query-time normalization does not prohibit indexes.

Maintain minimal indexes and projections needed for efficient:

- External-ID lookup.
- Type lookup.
- Genre filtering.
- Popularity sorting.
- Date filtering.
- Text search.
- Relationship lookup.
- Cache freshness checks.

Avoid arbitrary full-table JSONB scans for common high-traffic feed queries.

Measure performance and add documented indexes where justified.

---

# 13. Entity-store synchronization

Build a robust selective replication system from TMDB.

It must support:

- Fetch by canonical entity ID.
- Batch hydration where source endpoints permit it.
- Movie discovery queries.
- TV discovery queries.
- Search.
- Person lookup.
- Credits.
- Related titles.
- Seasons.
- Episodes.
- Ancillary detail hydration.
- Freshness checks.
- Stale-while-revalidate behavior.
- Request deduplication.
- Bounded concurrency.
- Rate limiting.
- Retries with exponential backoff.
- Retry-After handling.
- Partial failures.
- Durable retry state.
- Background cache warming.
- Adaptive refresh policies.
- Idempotent ingestion.

Treat upstream rate limits and terms of service as hard constraints.

TMDB may not offer a general continuous change stream for all needed data. Implement replication as selective polling, discovery, hydration, and refresh rather than assuming an upstream CDC feed exists.

Prioritize frequently viewed and frequently queried entities.

Avoid continuously refetching irrelevant catalog data.

Use PostgreSQL to coordinate refresh jobs and deduplication so the design can survive process restarts and eventually support multiple application replicas.

Do not rely exclusively on an in-memory queue.

Use bounded background work. Avoid unrestricted polling or uncontrolled request fan-out.

### Cache coverage

The system must understand the difference between:

- An entity that is fully hydrated for a given projection.
- An entity with partial details.
- A complete page of discovery results.
- A partial page.
- A cached query whose source coverage is stale.
- A query that cannot yet be answered from cached entities.

Never infer that the cache contains a complete result merely because some matching records exist.

Track provider-query identity, page/cursor coverage, retrieved result IDs, timestamps, and completion state as needed.

Arbitrary feed filters must not mistakenly interpret the current subset of cached TMDB titles as the complete upstream catalog.

---

# 14. Declarative query system

Implement a reusable, strongly typed query-definition abstraction.

The following is illustrative. Improve the interface where necessary without losing its essential semantics.

```ts
const discoverMovies = defineQuery({
  name: "discoverMovies",

  params: z.object({
    genres: z.array(z.number()).default([]),
    sortBy: z.enum([
      "popularity",
      "rating",
      "releaseDate",
      "random",
    ]),
    cursor: z.string().optional(),
  }),

  readCache: async (context) => {
    // Immediately read available PostgreSQL data.
  },

  loadCache: async (context) => {
    // Fetch missing/stale data from TMDB.
    // Persist the results in the entity store.
  },

  normalize: (context) => {
    // Produce typed application-facing projections.
  },
});
```

The exact API is a design decision, but every query definition must retain these distinct responsibilities.

### Query framework responsibilities

Provide:

- Query registration.
- Type-safe parameter validation.
- Canonical parameter serialization.
- Stable query identity.
- Cache reads.
- Cache completeness information.
- Background cache loading.
- Query-time normalization.
- Upstream request deduplication.
- Incremental result publication.
- Error propagation.
- Cancellation.
- Reconnection.
- Freshness policies.
- Pagination.
- Query observability.
- Testability without live TMDB access.

Avoid manually reimplementing this logic in every feature.

### Initial response

The first response must be derived from currently available PostgreSQL data.

Do not wait for TMDB before returning existing cached results.

If data is incomplete, explicitly represent that state in the protocol.

### Subsequent updates

When new source data arrives:

1. Validate the upstream response.
2. Persist source entities.
3. Update source and query coverage metadata.
4. Determine affected query subscriptions.
5. Compute normalized incremental results.
6. Publish the changes through SSE.
7. Merge them into the relevant TanStack DB collections.

Updates should be granular and efficient.

Avoid repeatedly sending entire movie lists when only a few entities have changed.

Support insert, update, remove, reset, and completion semantics as appropriate.

Ensure deterministic ordering and cursor handling when new source results arrive.

---

# 15. SSE protocol

Use Server-Sent Events for server-to-client synchronization.

SSE must support both:

- Entity/query updates.
- Social interaction events (posts, comments, counters, the viewer's likes and follows).

Define an explicit versioned event protocol.

Include:

- Event type.
- Protocol version.
- Event ID.
- Subscription/query identity.
- Entity IDs.
- Relevant payload or patch.
- Ordering/version information.
- Timestamp where useful.

Implement:

- Heartbeats.
- Connection lifecycle management.
- Last-Event-ID handling.
- Reconnection.
- Replay.
- Snapshot recovery.
- Stale subscription cleanup.
- Authenticated access.
- Correct content types and streaming headers.
- Graceful server shutdown.

Do not confuse SSE with bidirectional communication.

Client commands should use Hono RPC mutations.

The server publishes committed results and state changes through SSE.

For the initial single-server deployment, an in-process subscriber registry is acceptable for event delivery, provided PostgreSQL retains durable event state.

Do not assume in-process fan-out alone can deliver events across multiple instances.

Keep the protocol designed for eventual cross-process notifications.

---

# 16. PostgreSQL schema

Use Atlas to define and manage migrations.

Implement at least these logical data domains.

### Authentication

Better Auth user, session, account, and verification tables.

### Catalog replica

- Source entities.
- Source fetch metadata.
- Query cache and coverage.
- Synchronization jobs.
- Synchronization checkpoints.
- Indexable catalog projections where justified.

### Social

- Public user profiles.
- Member posts.
- Post likes.
- Comments.
- Follows of any account kind.
- Post engagement and account audience counters.
- Ordered events and mutation idempotency records.

Legacy tag, list, collaboration and activity tables from the previous product remain in place (no destructive migration) and are unused.

Design proper primary keys, foreign keys, uniqueness constraints, and transaction boundaries.

Use referential integrity consistently.

No feature should depend on unbounded in-memory state for data durability.

## Migrations

Atlas exclusively controls migrations.

Commit migrations to the repository.

Provide commands for:

- Schema diff.
- Migration generation.
- Migration validation.
- Migration application.
- Migration status.
- Drift detection.

Use safe additive migrations by default.

Never automatically perform destructive production changes without a reviewed migration and rollback strategy.

Better Auth schema changes must also flow through Atlas.

---

# 17. Mobile user experience

Mobile UX is the highest product-level priority.

Build a cohesive React interface using Mantine as the only design system. Follow docs/ui.md and its central theme/provider. Use neutral app language; avoid promotional copy.

Prefer established components and conventions instead of bespoke components.

Specialized movie-discovery interactions may use custom components where necessary.

### Navigation

Implement a bottom navigation system suitable for mobile.

Sections:

- For You.
- Following.
- Explore.
- Post (create).
- Profile.

Desktop uses a left sidebar with the same destinations and centers the feed column.

Use TanStack Router.

Preserve navigation context, scroll position, and active filters.

Implement working back navigation and deep linking.

### Visual design

Use:

- Large cinematic posters.
- Clear hierarchy.
- Consistent typography.
- Strong contrast.
- Generous touch targets.
- Carefully designed empty states.
- Appropriate safe-area handling.
- Responsive sheets and dialogs.
- Consistent motion.
- Accessible interaction patterns.

The desktop experience should adapt gracefully without compromising the mobile design.

### Absolutely no loading spinners

Never display a loading spinner.

Instead:

- Render available cached content immediately.
- Retain previous query results during transitions.
- Prefetch likely next data.
- Reserve image dimensions.
- Use poster placeholders where necessary.
- Show stable structural placeholders for genuinely uncached views.
- Perform mutations optimistically.
- Stream additional content into visible views.
- Use non-blocking status or error messages.

Do not misrepresent unavailable data as already loaded.

Cold-start and empty-cache behavior must be explicitly designed.

### Image performance

Implement:

- Lazy loading.
- Priority loading for visible images.
- Prefetching for upcoming feed slides.
- Correct responsive resolutions.
- Appropriate image decoding.
- Aspect-ratio preservation.
- Cache-friendly URLs.
- Graceful image failures.

Avoid rendering expensive media that is not visible.

---

# 18. Search and discovery

Implement a comprehensive global search experience.

Support searching:

- Movies.
- TV series.
- People.
- Members.

Use debounced input and immediate presentation of available cached matches.

Supplement incomplete local search results using the appropriate upstream TMDB endpoints.

Persist fetched source records into the entity store.

Do not bypass the entity-store synchronization architecture.

Show useful category distinctions and meaningful result ordering.

Support navigation from every search result.

---

# 19. Operational behavior

The application must be suitable for continuous operation with minimal maintenance.

Implement:

- Structured logging.
- Meaningful error categorization.
- Request IDs.
- API error handling.
- Database connection health diagnostics.
- TMDB rate-limit visibility.
- Entity-sync metrics.
- Cache hit/miss metrics.
- Cache coverage metrics.
- Query latency measurements.
- SSE connection counts.
- Event replay metrics.
- Failed-job visibility.
- Graceful shutdown.

Provide an unauthenticated liveness endpoint that does not depend on PostgreSQL, Vault, or TMDB being available.

Expose database readiness separately.

Use bounded database connection pools.

Retry only known transient failures.

Do not create an infinite restart loop due to a temporary database outage.

Background sync jobs must recover safely after a process restart.

No external Redis, Kafka, or message broker is required for the initial architecture.

---

# 20. Infrastructure and deployment implementation

Follow the infrastructure guide exactly:

https://www.chrisvouga.dev/llms.txt

### PostgreSQL

Verify the MovieFinder-specific allocation in the OpenTofu inventory.

Use `DATABASE_URL` without rewriting its internal connection parameters.

Keep production and development isolated.

Do not execute migrations until authorization and allocation are confirmed.

### Vault

Reuse the established shared Vault contracts.

Ensure the app's required keys are registered and available in the correct configurations.

Do not bypass infrastructure governance by adding untracked runtime secrets.

### Docker

Build a multi-stage production image.

The production image must include only what is needed to run the application.

The image must build without secret build arguments.

### GHCR

Publish through the reusable workflow documented in the infrastructure guide.

Do not create a parallel image-publishing process.

### Railway

Deploy through the central `crvouga/personal` OpenTofu inventory.

Do not manually configure Railway infrastructure outside the authoritative system.

Before opening a new hosting request, check whether MovieFinder already has an appropriate service entry.

If one exists, follow the documented process for updating it rather than creating a duplicate.

If an infrastructure change is required in `crvouga/personal`, prepare a complete change request containing resource allocations, required secret names, image contract, deployment settings, migration procedure, health checks, and operational requirements.

Do not modify shared control-plane services from the application repository.

### Object storage

Use the existing shared R2 integration only when application features need durable object storage.

Keep all MovieFinder objects under its dedicated application prefix.

Do not create another object-storage service.

---

# 21. Agent-first development and verification

The codebase must be optimized for repeated automated modifications by AI coding agents.

Favor:

- Small cohesive modules.
- Strict typing.
- Discriminated unions.
- Exhaustive state handling.
- Explicit domain boundaries.
- Immutable transformations where practical.
- Runtime validation at external boundaries.
- Deterministic test fixtures.
- Minimal hidden state.
- Reusable query and mutation abstractions.
- Clear, enforceable architecture rules.

Avoid unnecessary indirection and elaborate abstraction layers that increase agent complexity without improving correctness.

### Vite+ toolchain

Use Vite+ as the main toolchain.

Configure its supported equivalents of:

- Check.
- Format.
- Lint.
- Type-check.
- Test.
- Build.
- Development server.

Use stable native TypeScript 7 type checking.

Prefer a single comprehensive check command for CI and agents.

Use Vite+ native task orchestration and caching where appropriate.

### Testing levels

**Unit tests**

Test normalization, canonical identity, query parameter serialization, cache freshness, tag transitions, permission rules, and ordering algorithms.

**Property-based tests**

Test normalization stability, idempotency, pagination invariants, concurrent mutation consistency, and event replay correctness.

**Integration tests**

Use isolated PostgreSQL fixtures.

Verify Atlas migrations, Drizzle queries, Better Auth integration, cache reads, cache refreshes, and SSE behavior.

**API contract tests**

Verify Hono RPC typing, validation, authentication, and authorization.

**Browser E2E tests**

Use Playwright with realistic mobile viewports.

Verify feed swipes, topics, profiles, likes, follows, comments, posts, signed-out reading, sign-in prompts, authentication, and reconnect behavior.

**Visual tests**

Capture representative mobile screenshots and check layout regressions.

### Fast feedback

Keep ordinary local and PR checks fast.

Put expensive exploratory, stress, and comprehensive browser suites into a separate deeper validation stage.

Do not sacrifice meaningful type checking or essential unit coverage to optimize elapsed time.

Tests that require TMDB must use deterministic fixtures by default.

Live upstream smoke checks may be separate and must be honest about missing credentials or rate limits.

---

# 22. Mandatory acceptance criteria

Consider the application complete only when these scenarios pass.

### Authentication

- Registration and login work.
- Sessions survive reloads.
- Logged-out visitors can read every feed, profile, post and search.
- Interactions by visitors prompt sign-in and return to the same page.
- Commands and operator endpoints reject requests without a session.
- Better Auth persists all required records through PostgreSQL.

### Feeds

- A visitor can continuously swipe through heterogeneous posts (images, galleries, videos, member posts).
- Topic chips switch between all, movies, TV and genres.
- Feed position survives profile and post navigation.
- Posts already shown never reorder or duplicate as pages and provider results arrive.
- Pagination handles partially cached provider results correctly.
- Media preloads without exhausting browser memory.

### Accounts and interactions

- Movies, shows, people and members have profiles with posts, counts, follow and tabs.
- Likes, follows, comments and posts update optimistically and are consistent across views.
- Counters stay exact under concurrent interactions.
- Followed accounts' posts appear in Following.
- Ownership rules for deleting posts and comments are enforced on the backend.
- Reconnecting clients recover missed events; duplicate events are harmless.

### Catalog

- Movie details are comprehensive and navigable.
- TV series, seasons, and episodes work.
- People profiles expose relevant filmography.
- Credits link correctly to people and titles.
- Related and recommended titles navigate correctly.
- Missing upstream fields do not break rendering.

### Entity store

- Source entities are stored canonically.
- Concurrent requests deduplicate upstream fetches.
- Cached results return without waiting for TMDB.
- Missing data triggers a background hydration attempt.
- Newly fetched data appears through SSE.
- Partial cache coverage is explicitly represented.
- Refresh jobs survive process restarts.
- Query-time normalization is deterministic.
- Upstream errors do not corrupt stored source data.
- TMDB downtime does not make cached content unusable.

### UI and performance

- No loading spinners exist anywhere.
- No unexpected layout shifts during feed browsing.
- Mobile navigation is touch-friendly and accessible.
- Filtering does not unnecessarily clear visible content.
- Repeated navigation uses cached data efficiently.
- The feed remains smooth on realistic mobile devices.

### Deployment

- Local development uses one browser origin.
- Production uses one Bun process with explicitly configured public origins. Each browser flow stays on one origin, with host-only cookies and its exact registered callback.
- The Docker image builds reproducibly.
- CI runs the required automated checks.
- Atlas migrations are validated.
- All secrets follow Vault conventions.
- The PostgreSQL allocation is project-isolated.
- Hosting follows the shared infrastructure workflow.
- The live health endpoint passes.

---

# 23. Implementation order

Implement in dependency order.

**Phase 1 — Foundation**

Inspect repository, read infrastructure documentation, verify allocations, establish Vite+, React, Hono, Better Auth, PostgreSQL, Atlas, and Docker.

**Phase 2 — Catalog infrastructure**

Implement entity-store storage, synchronization, TMDB integration, normalization, cache coverage, and declarative queries.

**Phase 3 — Client synchronization**

Implement TanStack DB collections, Hono RPC integration, SSE delivery, optimistic mutations, and reconnection.

**Phase 4 — Discovery**

Implement the Swiper.js post feeds, topics, pagination, Explore grid, and search.

**Phase 5 — Catalog navigation**

Implement movie, TV, person and member account profiles.

**Phase 6 — Social interactions**

Implement likes, follows, comments, member posts, counters, realtime delivery, and event recovery.

**Phase 7 — Product polish**

Improve mobile interaction design, image performance, caching, accessibility, and empty states.

**Phase 8 — Verification and deployment**

Complete automated tests, migration validation, Docker verification, shared infrastructure integration, CI, and production smoke checks.

These phases are implementation stages, not excuses to stop before the whole specification is delivered.

---

# 24. Documentation deliverables

Create and maintain:

- `README.md` — setup, architecture, and application usage.
- `AGENTS.md` — rules for AI coding agents, linking to the shared infrastructure guide.
- `docs/architecture.md` — system boundaries and data flows.
- `docs/entity-store.md` — data model, replication, cache coverage, and refresh semantics.
- `docs/query-system.md` — `defineQuery`, normalization, pagination, and SSE behavior.
- `docs/realtime.md` — event protocol, interaction concurrency, and reconnect behavior.
- `docs/infrastructure.md` — authoritative integration and deployment procedures.
- `docs/testing.md` — test strategy and required commands.

Document the current implementation, not merely its intended architecture.

Avoid duplicating secret configuration or hardcoding infrastructure details that should be retrieved from `llms.txt`.

---

# 25. Final operating instructions

Execute this specification against the target repository.

Do not stop after writing plans, interfaces, migrations, or mock UI.

Implement complete vertical features backed by real persistence and working APIs.

Do not silently reduce scope.

Prefer existing, reliable libraries over reinventing commodity functionality.

Keep the app deployable as one service.

Keep the source code understandable and strongly typed.

Keep the feedback loop extremely fast.

Treat mobile UX, data consistency, source-data integrity, and collaborative correctness as first-class requirements.

Where a feature cannot be completed because of missing external authorization or credentials, finish independent work and explicitly report the exact unresolved dependency.

At completion, provide:

1. Summary of implemented features.
2. Architecture and important design decisions.
3. Files and modules added or changed.
4. Verification commands and actual results.
5. Migration status.
6. Infrastructure integration and deployment status.
7. Any remaining external blockers or known limitations.

**Do not claim completion unless the implementation and its verification genuinely satisfy the specification.**
