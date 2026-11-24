# Realtime

All commands use session-authenticated HTTP, not SSE. The stream is server-to-client delivery of committed changes, open to signed-out visitors.

## Protocol v1

`/api/events` sends `change` events with SSE `id` and a JSON envelope containing `protocol`, global `id`, event `type`, subscription identity, normalized entities, removed kind/ID pairs, and timestamp. Types include `upsert`, `remove`, `reset`, and `complete`. Heartbeats are emitted every 15 seconds. Cache-control and proxy buffering headers preserve streaming.

Events with a null audience (posts, comments, engagement and audience counters, profiles, catalog hydration, provider page progress) reach every visitor. Events addressed to a member (their own likes and follows, subscription `viewer:<id>`) reach only that member's session. A signed-in stream rechecks its session every 30 seconds.

The bootstrap snapshot (`/api/state`) returns the viewer's own state and a replay cursor from the same repeatable-read snapshot; visitors receive an empty snapshot. Clients connect from that cursor; EventSource supplies Last-Event-ID on reconnect. If a retained event floor is newer than the cursor, the server sends a consistent snapshot reset and resumes from its watermark. Clients process events sequentially, ignore already processed IDs and reject older entity revisions.

Each browser read lists its `subscriptions` (for example `discover:<page>`, `entity:<id>`, `post:<id>`, `account:<id>`, `posts`). An event on one of them re-reads that view shortly afterwards; entities in the event merge immediately.

Events are retained durably without automated deletion; the stale-cursor path already handles a retained floor. Operation receipts must remain longer than the accepted retry horizon.

## Deterministic conflict rules

A PostgreSQL transaction advisory lock is taken before mutating application state or emitting events, and held through commit, so event IDs reflect commit order. It also serializes duplicate command IDs and counter updates.

An operation receipt is keyed by member plus operation UUID and records a payload fingerprint and result. Exact retries return the same result; reusing the UUID for a different command returns 409. State, counters, events and receipt commit atomically.

- Likes and follows are idempotent rows. Counters change only when a row is actually inserted or deleted, and are clamped at zero. The viewer's like/follow entity is versioned by commit time and carries `active`; an undo is a newer inactive version, so a late event for an earlier like cannot resurrect it.
- Comments and member posts use the operation UUID as their identity; their removal is a tombstone.
- Catalog post identities (`tmdb:<kind>:<id>~<slug>`) are derived deterministically from the source record, so a refreshed account keeps its likes and comments. Interactions validate that the derived post still exists.
- Only a comment's author or the author of the member post it is on may remove it; only a post's author may delete it.

A per-member browser outbox persists only pending command intents, never authentication secrets or copies of server entities. Reload recovery reuses operation IDs; receipts make committed retries harmless. Browser keepalive lets a submitted command finish during navigation.
