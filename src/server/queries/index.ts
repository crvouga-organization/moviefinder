import { supportsGenres } from "../../shared/genres";
import { and, eq, inArray, ilike, desc } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "../db";
import { sources, queryCache } from "../db/schema";
import { digest } from "../entity-store";
import { normalize as normalizeSource, summaryOf } from "../entity-store/normalize";
import type { Sync } from "../entity-store-sync";
import {
  feedParams,
  sourceId,
  stableSerialize,
  fieldText,
  type FeedParams,
  type Entity,
  type Coverage,
  type QueryResult,
} from "../../shared/contracts";
import { localMatch } from "../../shared/filters";
export { localMatch } from "../../shared/filters";
import { metrics } from "../log";
export function defineQuery<P, C, R>(definition: {
  name: string;
  params: z.ZodType<P>;
  readCache: (params: P, signal?: AbortSignal) => Promise<C>;
  loadCache: (params: P, cache: C, signal?: AbortSignal) => Promise<void>;
  normalize: (cache: C, params: P) => R;
}) {
  return {
    ...definition,
    async execute(input: unknown, signal?: AbortSignal): Promise<R> {
      const start = performance.now(),
        params = definition.params.parse(input);
      signal?.throwIfAborted();
      const cached = await definition.readCache(params, signal);
      signal?.throwIfAborted();
      await definition.loadCache(params, cached, signal);
      const result = definition.normalize(cached, params);
      metrics.queries++;
      metrics.queryMilliseconds += performance.now() - start;
      return result;
    },
  };
}
const cursorSchema = z.object({ page: z.number().int().min(1).max(500), key: z.string() });
export function queryIdentity(p: FeedParams) {
  const { cursor: _, exclude: __, ...identity } = p;
  return digest(stableSerialize(identity));
}
export function decodeCursor(p: FeedParams) {
  if (!p.cursor) return 1;
  try {
    const c = cursorSchema.parse(JSON.parse(Buffer.from(p.cursor, "base64url").toString()));
    if (c.key !== queryIdentity(p)) throw new Error();
    return c.page;
  } catch {
    throw new Error("Invalid cursor for these feed filters");
  }
}
export function encodeCursor(p: FeedParams, page: number) {
  return Buffer.from(JSON.stringify({ page, key: queryIdentity(p) })).toString("base64url");
}
const coverageOf = (cached: typeof queryCache.$inferSelect | undefined, p: FeedParams) => {
  const stale = !!cached?.refreshAt && cached.refreshAt.getTime() < Date.now();
  const coverage: Coverage = {
    complete: cached?.complete === true,
    state: cached?.error
      ? "error"
      : !cached
        ? "missing"
        : !cached.complete
          ? "partial"
          : stale
            ? "stale"
            : "complete",
    fetchedAt: cached?.fetchedAt?.toISOString() ?? null,
    nextCursor: cached?.nextPage ? encodeCursor(p, cached.nextPage) : null,
    unsupported: [],
    ...(cached?.error ? { message: cached.error } : {}),
  };
  if (
    (p.type === "both" && !supportsGenres("movie", p.genres)) ||
    (p.type !== "movie" && !supportsGenres("tv", p.genres))
  )
    coverage.unsupported.push(
      "Movie and TV genre categories differ. This topic only includes title types that support it.",
    );
  return coverage;
};
export function createQueries(db: Database, sync: Sync) {
  // A page of provider discovery: the titles (and, for trending and search, people) behind a feed.
  const discovery = defineQuery({
    name: "discover",
    params: feedParams,
    async readCache(p) {
      const page = decodeCursor(p),
        id = `discover:${queryIdentity(p)}:${page}`;
      const [cached] = await db.select().from(queryCache).where(eq(queryCache.id, id));
      let ids = cached?.ids ?? [];
      if (!cached) {
        metrics.cacheMiss++;
        // Never treat a local subset as the provider's page; it only fills the first screen.
        const rows =
          page === 1
            ? await db
                .select({ id: sources.id })
                .from(sources)
                .where(
                  and(
                    p.type === "both"
                      ? inArray(
                          sources.entityType,
                          p.q ? ["movie", "tv", "person"] : ["movie", "tv"],
                        )
                      : eq(sources.entityType, p.type),
                    p.q ? ilike(sources.title, `%${p.q.replace(/[%_\\]/g, "\\$&")}%`) : undefined,
                  ),
                )
                .orderBy(desc(sources.popularity))
                .limit(20)
            : [];
        ids = rows.map((r) => r.id);
      } else metrics.cacheHit++;
      const records = ids.length
        ? await db.select().from(sources).where(inArray(sources.id, ids))
        : [];
      return { id, page, cached, records, ids };
    },
    async loadCache(p, cache) {
      if (!cache.cached)
        await db
          .insert(queryCache)
          .values({ id: cache.id, name: "discover", params: JSON.parse(stableSerialize(p)) })
          .onConflictDoNothing();
      if (
        !cache.cached?.complete ||
        !cache.cached.refreshAt ||
        cache.cached.refreshAt.getTime() < Date.now()
      )
        await sync.enqueue(cache.id, "query", { queryId: cache.id, params: p, page: cache.page });
    },
    normalize(cache, p) {
      const byId = new Map(cache.records.map((r) => [r.id, r]));
      const allowPeople = !!p.q || (p.sort === "trending" && p.type === "both");
      let rows = cache.ids
        .map((id) => byId.get(id))
        .filter((r): r is NonNullable<typeof r> => !!r)
        .filter((r) => {
          const [entity] = summaryOf(r.id, r.payload, r.version);
          if (!entity) return false;
          if (entity.kind === "person") return allowPeople;
          return localMatch(
            entity,
            p,
            !!cache.cached?.complete &&
              !p.q &&
              p.sort !== "trending" &&
              (entity.kind === "movie" || (!p.cast.length && !p.crew.length)),
          );
        });
      if (p.sort === "random")
        rows = rows.sort((a, b) => digest(p.seed + a.id).localeCompare(digest(p.seed + b.id)));
      else if (p.sort !== "trending" && !p.q)
        rows = rows.sort(
          (a, b) =>
            (p.sort === "rating"
              ? b.rating - a.rating
              : p.sort === "lowest"
                ? a.rating - b.rating
                : p.sort === "newest"
                  ? fieldText(b.releaseDate).localeCompare(fieldText(a.releaseDate))
                  : p.sort === "oldest"
                    ? fieldText(a.releaseDate).localeCompare(fieldText(b.releaseDate))
                    : b.popularity - a.popularity) || a.id.localeCompare(b.id),
        );
      return { id: cache.id, rows, coverage: coverageOf(cache.cached, p) };
    },
  });
  // How long a request may wait for a cold account's hydration before events finish the job.
  const hydrationWait = 2500;
  const entity = (warm = false) =>
    defineQuery({
      name: "entity",
      params: sourceId,
      async readCache(id) {
        const [row] = await db.select().from(sources).where(eq(sources.id, id));
        return { row };
      },
      async loadCache(id, cache, signal) {
        const { row } = cache;
        if (!row || row.projection !== "detail" || row.refreshAt.getTime() < Date.now()) {
          await sync.hydrate(id, warm ? 1000 : 0);
          if (
            !warm &&
            (!row || row.projection !== "detail") &&
            (await sync.settled(id, hydrationWait, signal))
          )
            [cache.row] = await db.select().from(sources).where(eq(sources.id, id));
        }
      },
      normalize({ row }, id) {
        const coverage: Coverage = {
          state: !row
            ? "missing"
            : row.projection !== "detail"
              ? "partial"
              : row.refreshAt.getTime() < Date.now()
                ? "stale"
                : "complete",
          fetchedAt: row?.fetchedAt.toISOString() ?? null,
          nextCursor: null,
          unsupported: [],
          ...(row?.error ? { message: row.error } : {}),
        };
        const graph: Entity[] = row
          ? row.projection === "detail"
            ? normalizeSource(id, row.payload, row.version)
            : summaryOf(id, row.payload, row.version)
          : [];
        return { row, graph, coverage };
      },
    });
  return {
    definitions: { discover: discovery, entity: entity() },
    // Waits for a cold provider page so the first screen is real, then answers from cache.
    async discover(input: unknown, signal?: AbortSignal, waitMs = 0) {
      const result = await discovery.execute(input, signal);
      if (
        waitMs &&
        ["missing", "partial"].includes(result.coverage.state) &&
        (await sync.settledJob(result.id, waitMs, signal))
      )
        return discovery.execute(input, signal);
      return result;
    },
    entity: (id: string, signal?: AbortSignal, warm = false) => entity(warm).execute(id, signal),
  };
}
export type Queries = ReturnType<typeof createQueries>;
export type { QueryResult };
