# Query system

`defineQuery` separates parameter validation, cache reading, background scheduling, and normalization. Cache execution reads PostgreSQL immediately and schedules durable work. Request cancellation prevents publishing an abandoned response. Shared durable hydration is not canceled merely because one viewer navigates away.

## Catalog queries

`src/server/queries` owns two definitions. **Discover** reads one provider page (trending, popular-by-topic or search) from `query_cache`, schedules missing or stale pages on the durable sync lane, and returns the cached source rows. **Entity** reads one account's source row and schedules hydration (detail plus images and videos) when it is missing, a summary, or stale, waiting a bounded time for a cold row. Feed parameters are validated with Zod, serialized with sorted keys, and cursors bind to the filter identity. A local subset is never treated as a complete provider page: it only fills the first screen of a cold page 1.

## Feeds and views

`src/server/feeds.ts` turns catalog pages into post feeds:

- **For You / Explore** expand each page's accounts into featured posts (`featuredPosts`) and weave recent member posts in (`interleave`). Topic chips map to `type`/`genres`; For You's "All" uses trending (which includes people). Hydration of the page's accounts is scheduled at low priority so richer posts (trailers, galleries, cast) appear as the cache warms.
- **Following** reads the viewer's follows, round-robins followed catalog accounts' derived posts and merges member posts by followed members or tagging followed accounts. It is paginated by offset.
- **Account** returns the account graph, its derived posts and tab views (`posts`, `videos`, `community`, `cast`, `related`, `credits`, `likes`).
- **Post** returns a post with its latest comments; **Search** returns members and provider accounts.

Every read returns `QueryResult`: entities, ordered IDs, named `views`, coverage, and the event `subscriptions` whose changes make it stale. Posts arrive with their author, engagement counters, author audience and the viewer's like/follow state. The browser stores each read as a `query` row in TanStack DB; entities stay in their canonical collections.

Feed ordering in the browser is append-only: `useFeed` accumulates pages and de-duplicates, so a late provider result or a later page never moves a post already shown.

Query counters, latency, cache hits/misses, provider requests/rate limits, and failed jobs are exposed through session-protected metrics. Source responses and errors never expose provider credentials.

## Navigation

All route components ship in the initial bundle and commit without awaiting data. A destination renders cached canonical data immediately or reserved placeholders, and the route's own read joins the navigation's telemetry trace and marks its content ready.
