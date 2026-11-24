import { and, asc, desc, eq, inArray } from "drizzle-orm";
import type { Database } from "./db";
import * as s from "./db/schema";
import type { Queries } from "./queries";
import type { Sync } from "./entity-store-sync";
import { AppError } from "./log";
import { accountSummary, catalogPostsFor } from "./posts";
import {
  accountContext,
  commentEntity,
  likedPostIds,
  memberPost,
  postContext,
  publicUser,
  recentMemberPosts,
  searchUsers,
  userEntity,
} from "./social";
import { featuredPosts, interleave } from "../shared/posts";
import { entityIds } from "../shared/detail-graph";
import {
  accountKind,
  feedParams,
  fieldText,
  postAccount,
  userIdOf,
  type Coverage,
  type Entity,
  type FeedRequest,
  type PostData,
  type QueryResult,
} from "../shared/contracts";

const pageSize = 15;
const complete = (nextCursor: string | null = null): Coverage => ({
  state: "complete",
  fetchedAt: new Date().toISOString(),
  nextCursor,
  unsupported: [],
});
const offsetCursor = (cursor: string | undefined) => {
  if (!cursor) return 0;
  if (!/^\d{1,6}$/.test(cursor)) throw new AppError(400, "Invalid feed cursor");
  return Number(cursor);
};
type SourceRow = typeof s.sources.$inferSelect;

export function createFeeds(db: Database, queries: Queries, sync: Sync) {
  async function sourceRows(ids: string[]) {
    const unique = [...new Set(ids)];
    if (!unique.length) return new Map<string, SourceRow>();
    const rows = await db.select().from(s.sources).where(inArray(s.sources.id, unique));
    return new Map(rows.map((r) => [r.id, r]));
  }
  // Authors, counters and the viewer's likes and follows for a set of posts.
  async function withContext(posts: Entity[], accounts: Entity[], viewer: string | null) {
    const authors = [...new Set(posts.map((p) => (p.data as PostData).author))];
    return [
      ...accounts,
      ...posts,
      ...(await postContext(db, posts, viewer)),
      ...(await accountContext(db, authors, viewer)),
    ];
  }
  // Resolves stored or derived posts by ID, keeping the requested order.
  async function resolvePosts(ids: string[]) {
    const member = ids.filter((id) => id.startsWith("post:"));
    const catalog = [...new Set(ids.map(postAccount).filter((a): a is string => !!a))];
    const rows = await sourceRows(catalog);
    const found = new Map<string, Entity>();
    for (const row of rows.values())
      for (const post of catalogPostsFor(row)) if (ids.includes(post.id)) found.set(post.id, post);
    if (member.length)
      for (const row of await db.select().from(s.posts).where(inArray(s.posts.id, member)))
        found.set(row.id, memberPost(row));
    const accounts = [...rows.values()].flatMap((r) => accountSummary(r) ?? []);
    return { posts: ids.flatMap((id) => found.get(id) ?? []), accounts };
  }
  const hydrateLater = async (rows: Iterable<SourceRow>, limit: number, delayMs: number) => {
    let n = 0;
    for (const row of rows)
      if (row.projection !== "detail" && n++ < limit) await sync.hydrate(row.id, delayMs);
  };

  // For You and Explore: provider discovery pages expanded into each account's featured posts,
  // with member posts woven in. A topic picks the provider query behind the feed.
  async function catalogFeed(
    request: FeedRequest,
    viewer: string | null,
    signal?: AbortSignal,
  ): Promise<QueryResult> {
    const { feed, topic } = request;
    const type = topic === "movie" || topic === "tv" ? topic : "both";
    const genre = /^\d+$/.test(topic) ? [Number(topic)] : [];
    const params = feedParams.parse({
      type,
      genres: genre,
      sort: feed === "foryou" && !genre.length ? "trending" : "popularity",
      seed: feed,
      cursor: request.cursor,
    });
    let page: Awaited<ReturnType<Queries["discover"]>>;
    try {
      page = await queries.discover(params, signal, 6000);
    } catch (error) {
      if (error instanceof Error && /cursor/i.test(error.message))
        throw new AppError(400, "Invalid feed cursor");
      throw error;
    }
    const pageNumber = request.cursor ? Number(page.id.split(":").pop()) || 1 : 1;
    const accounts = page.rows.flatMap((r) => accountSummary(r) ?? []);
    const catalog = page.rows.flatMap((row) =>
      featuredPosts(catalogPostsFor(row), `${feed}:${row.id}`, feed === "foryou" ? 2 : 1),
    );
    const members =
      topic === "all"
        ? await recentMemberPosts(db, { offset: (pageNumber - 1) * 3, limit: 3 })
        : [];
    const ids = interleave(
      catalog.map((p) => p.id),
      members.map((p) => p.id),
      4,
    );
    // Richer posts (trailers, galleries, cast) appear once details are cached.
    await hydrateLater(page.rows, 6, 1500);
    return {
      id: `feed:${feed}:${topic}:${pageNumber}`,
      ids,
      entities: await withContext([...catalog, ...members], accounts, viewer),
      coverage: page.coverage,
      subscriptions: [page.id, "posts"],
    };
  }

  async function following(request: FeedRequest, viewer: string | null): Promise<QueryResult> {
    const offset = offsetCursor(request.cursor);
    if (!viewer)
      return {
        id: "feed:following",
        ids: [],
        entities: [],
        coverage: { ...complete(), message: "signed-out" },
      };
    const follows = await db
      .select({ targetId: s.follows.targetId })
      .from(s.follows)
      .where(
        and(
          eq(s.follows.userId, viewer),
          inArray(s.follows.targetKind, ["user", "movie", "tv", "person"]),
        ),
      )
      .orderBy(asc(s.follows.targetId))
      .limit(500);
    const targets = follows.map((f) => f.targetId);
    const catalogTargets = targets.filter((t) => t.startsWith("tmdb:"));
    const members = targets.flatMap((t) => userIdOf(t) ?? []);
    const rows = await sourceRows(catalogTargets);
    // Followed accounts' posts, round-robin so one prolific account cannot fill the page.
    const lanes = catalogTargets.map((id) => {
      const row = rows.get(id);
      return row ? catalogPostsFor(row) : [];
    });
    const catalog: Entity[] = [];
    for (let i = 0; lanes.some((lane) => lane.length > i); i++)
      for (const lane of lanes) if (lane[i]) catalog.push(lane[i]!);
    const memberPosts = await recentMemberPosts(db, {
      authors: members,
      subjects: catalogTargets,
      limit: 200,
    });
    const all = interleave(
      memberPosts.map((p) => p.id),
      catalog.map((p) => p.id),
      1,
    );
    const ids = all.slice(offset, offset + pageSize);
    const byId = new Map([...catalog, ...memberPosts].map((p) => [p.id, p]));
    const posts = ids.flatMap((id) => byId.get(id) ?? []);
    await hydrateLater(rows.values(), 10, 500);
    return {
      id: `feed:following:${offset}`,
      ids,
      entities: await withContext(
        posts,
        [...rows.values()].flatMap((r) => accountSummary(r) ?? []),
        viewer,
      ),
      coverage: complete(offset + pageSize < all.length ? String(offset + pageSize) : null),
      subscriptions: ["posts", `viewer:${viewer}`, ...catalogTargets.map((id) => `entity:${id}`)],
    };
  }

  async function account(
    id: string,
    viewer: string | null,
    signal?: AbortSignal,
  ): Promise<QueryResult> {
    const member = userIdOf(id);
    if (member) {
      const [row] = await db.select(publicUser).from(s.user).where(eq(s.user.id, member));
      if (!row) throw new AppError(404, "This account doesn’t exist");
      const posts = await recentMemberPosts(db, { authors: [member], limit: 60 });
      const liked = await resolvePosts(await likedPostIds(db, member, 0, 60));
      return {
        id: `account:${id}`,
        ids: [id],
        entities: [
          userEntity(row),
          ...(await withContext([...posts, ...liked.posts], liked.accounts, viewer)),
          ...(await accountContext(db, [id], viewer)),
        ],
        coverage: complete(),
        views: { posts: posts.map((p) => p.id), likes: liked.posts.map((p) => p.id) },
        subscriptions: [`account:${id}`, "posts", `user:${member}`],
      };
    }
    const result = await queries.entity(id, signal);
    const root = result.graph.find((e) => e.id === id);
    if (!root && result.coverage.state === "missing" && result.coverage.message)
      throw new AppError(404, "This account isn’t available");
    const byId = new Map(result.graph.map((e) => [e.id, e]));
    const posts = result.row ? catalogPostsFor(result.row) : [];
    const community = await recentMemberPosts(db, { subjects: [id], limit: 60 });
    const relations = (root?.data.relations ?? {}) as Record<string, unknown>;
    const cast = [
      ...new Set(
        entityIds(root?.data.credits)
          .map((c) => fieldText(byId.get(c)?.data.personId))
          .filter(Boolean),
      ),
    ].slice(0, 40);
    const related = [
      ...new Set([...entityIds(relations.recommendations), ...entityIds(relations.similar)]),
    ].slice(0, 30);
    const credits = [
      ...new Set([...entityIds(relations.knownFor), ...entityIds(relations.filmography)]),
    ].slice(0, 60);
    const kind = accountKind(id);
    return {
      id: `account:${id}`,
      ids: root ? [id] : [],
      entities: [
        ...result.graph,
        ...(await withContext([...posts, ...community], [], viewer)),
        ...(await accountContext(db, [id], viewer)),
      ],
      coverage: result.coverage,
      views: {
        posts: posts.map((p) => p.id),
        videos: posts.filter((p) => (p.data as PostData).format === "video").map((p) => p.id),
        community: community.map((p) => p.id),
        ...(kind === "person" ? { credits } : { cast, related }),
      },
      subscriptions: [`entity:${id}`, `account:${id}`, "posts"],
    };
  }

  async function post(id: string, viewer: string | null, signal?: AbortSignal) {
    const account = postAccount(id);
    if (account) {
      const [row] = await db.select().from(s.sources).where(eq(s.sources.id, account));
      if (!row || (row.projection !== "detail" && !catalogPostsFor(row).some((p) => p.id === id))) {
        await queries.entity(account, signal);
      }
    }
    const { posts, accounts } = await resolvePosts([id]);
    const found = posts[0];
    if (!found) throw new AppError(404, "This post isn’t available");
    const rows = await db
      .select()
      .from(s.comments)
      .where(eq(s.comments.postId, id))
      .orderBy(desc(s.comments.createdAt), desc(s.comments.id))
      .limit(100);
    const comments = rows.map(commentEntity);
    const authors = [...new Set(rows.map((r) => r.userId))];
    const users = authors.length
      ? (await db.select(publicUser).from(s.user).where(inArray(s.user.id, authors))).map(
          userEntity,
        )
      : [];
    return {
      id: `post:${id}`,
      ids: [id],
      entities: [...(await withContext([found], accounts, viewer)), ...comments, ...users],
      coverage: complete(),
      views: { comments: comments.map((c) => c.id) },
      subscriptions: [`post:${id}`],
    } satisfies QueryResult;
  }

  // Accounts matching a name: members first, then the provider's titles and people.
  async function search(q: string, viewer: string | null, signal?: AbortSignal) {
    const users = await searchUsers(db, q);
    const page = await queries.discover(feedParams.parse({ q }), signal, 4000);
    const accounts = page.rows.flatMap((r) => accountSummary(r) ?? []);
    const ids = [...users, ...accounts].map((a) => a.id);
    return {
      id: `search:${q}`,
      ids,
      entities: [...users, ...accounts, ...(await accountContext(db, ids, viewer))],
      coverage: page.coverage,
      subscriptions: [page.id],
    } satisfies QueryResult;
  }

  return {
    feed(request: FeedRequest, viewer: string | null, signal?: AbortSignal) {
      return request.feed === "following"
        ? following(request, viewer)
        : catalogFeed(request, viewer, signal);
    },
    account,
    post,
    search,
  };
}
