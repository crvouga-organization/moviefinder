import { beforeAll, afterAll, describe, it, expect } from "vite-plus/test";
import { eq, sql } from "drizzle-orm";
import { createDatabase } from "../../src/server/db";
import { assertDatabaseReady } from "../../src/server/db/readiness";
import { createApplication } from "../../src/server/app";
import { createEntityStore } from "../../src/server/entity-store";
import { executeCommand } from "../../src/server/commands";
import { readConfig } from "../../src/server/config";
import { replay, currentCursor } from "../../src/server/events";
import * as schema from "../../src/server/db/schema";
import type { Command, Entity, QueryResult } from "../../src/shared/contracts";
import { movieDetail, television, fixtureUpstream } from "../fixtures/catalog";
import { startGoogle, googleSignIn, type GoogleTestProvider } from "../fixtures/google";
const url = process.env.TEST_DATABASE_URL;
if (
  !url ||
  !["127.0.0.1", "localhost"].includes(new URL(url).hostname) ||
  !new URL(url).pathname.endsWith("_test")
)
  throw new Error(
    "Integration tests require a disposable loopback TEST_DATABASE_URL whose database name ends in _test. Run bun run test:integration.",
  );
const { db, pool } = createDatabase(url),
  config = readConfig({
    DATABASE_URL: url,
    BETTER_AUTH_SECRET: "isolated-test-auth-secret-at-least-32-characters",
    MOVIEFINDER_ORIGIN: "http://localhost:5173",
    NODE_ENV: "test",
  }),
  store = createEntityStore(db);
let service: ReturnType<typeof createApplication>;
let google: GoogleTestProvider;
type Member = { id: string; cookie: string };
let alice: Member, bob: Member, carol: Member;
const poster = "tmdb:movie:550~poster";
async function register(name: string): Promise<Member> {
  const signedIn = await googleSignIn(service, google, config.MOVIEFINDER_ORIGIN, {
    id: name,
    email: `${name}@example.test`,
    name,
  });
  await db
    .update(schema.user)
    .set({ username: name, displayUsername: name })
    .where(eq(schema.user.id, signedIn.id));
  return signedIn;
}
const get = async <T = QueryResult>(path: string, member?: Member) => {
  const res = await service.app.request(path, {
    headers: member ? { Cookie: member.cookie } : {},
  });
  return { status: res.status, body: (await res.json()) as T };
};
type Input = Command extends infer C ? (C extends Command ? Omit<C, "operationId"> : never) : never;
async function send(member: Member | undefined, command: Input, id?: string) {
  const res = await service.app.request("/api/command", {
    method: "POST",
    headers: {
      ...(member ? { Cookie: member.cookie } : {}),
      Origin: config.MOVIEFINDER_ORIGIN,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ...command, operationId: id ?? crypto.randomUUID() }),
  });
  return {
    status: res.status,
    body: (await res.json()) as { entities: Entity[]; removed: { id: string }[]; error?: string },
  };
}
const find = (entities: Entity[], kind: string, id: string) =>
  entities.find((e) => e.kind === kind && e.id === id);

beforeAll(async () => {
  google = await startGoogle(config.MOVIEFINDER_ORIGIN);
  service = createApplication(db, { ...config, ...google.config }, fixtureUpstream);
  service.sync.start();
  await db.execute(
    sql`truncate moviefinder."user",moviefinder.source_entity,moviefinder.query_cache,moviefinder.sync_job,moviefinder.event,moviefinder.post,moviefinder.post_like,moviefinder.comment,moviefinder.post_engagement,moviefinder.account_stat cascade`,
  );
  alice = await register("alice");
  bob = await register("bob");
  carol = await register("carol");
  await db.transaction(async (tx) => {
    await store.ingest(tx, "tmdb:movie:550", movieDetail, "detail");
    await store.ingest(tx, "tmdb:tv:1399", television);
  });
});
afterAll(async () => {
  service.stop();
  await google.close();
  await pool.end();
});

describe("public reading", () => {
  it("serves application reads to signed-out visitors and keeps liveness independent", async () => {
    expect((await service.app.request("/health")).status).toBe(200);
    const state = await get<{ entities: Entity[]; viewer: string | null }>("/api/state");
    expect(state.status).toBe(200);
    expect(state.body).toMatchObject({ entities: [], viewer: null });
    expect((await get("/api/ready")).status).toBe(401);
    expect((await get("/api/metrics")).status).toBe(401);
  });
  it("serves the For You feed as posts from provider pages", async () => {
    const feed = await get("/api/feed?feed=foryou");
    expect(feed.status).toBe(200);
    expect(feed.body.ids.length).toBeGreaterThan(4);
    const posts = feed.body.entities.filter((e) => e.kind === "post");
    for (const id of feed.body.ids) expect(posts.some((p) => p.id === id)).toBe(true);
    // Trending includes people and series, not only movies.
    expect(feed.body.ids.some((id) => id.startsWith("tmdb:person:"))).toBe(true);
    expect(feed.body.ids.some((id) => id.startsWith("tmdb:tv:"))).toBe(true);
    // Every post's author and counters arrive with it.
    for (const post of posts) {
      expect(find(feed.body.entities, "engagement", post.id)).toBeTruthy();
      expect(find(feed.body.entities, "audience", String(post.data.author))).toBeTruthy();
    }
    expect(feed.body.coverage.nextCursor).toBeTruthy();
    const next = await get(
      `/api/feed?feed=foryou&cursor=${encodeURIComponent(feed.body.coverage.nextCursor!)}`,
    );
    expect(next.status).toBe(200);
    expect(next.body.ids.length).toBeGreaterThan(0);
    expect((await get("/api/feed?feed=foryou&cursor=not-a-cursor")).status).toBe(400);
  });
  it("filters For You and Explore by topic", async () => {
    const movies = await get("/api/feed?feed=explore&topic=movie");
    expect(movies.status).toBe(200);
    expect(movies.body.ids.length).toBeGreaterThan(0);
    expect(movies.body.ids.every((id) => id.startsWith("tmdb:movie:"))).toBe(true);
    expect((await get("/api/feed?feed=explore&topic=unknown")).status).toBe(400);
  });
  it("serves catalog account profiles with derived posts and tabs", async () => {
    const account = await get("/api/accounts/tmdb:movie:550");
    expect(account.status).toBe(200);
    expect(account.body.ids).toEqual(["tmdb:movie:550"]);
    expect(account.body.views?.posts).toContain(poster);
    expect(account.body.views?.videos).toEqual(["tmdb:movie:550~video:test-trailer"]);
    expect(account.body.views?.cast).toContain("tmdb:person:287");
    expect(account.body.views?.related).toContain("tmdb:movie:680");
    expect(find(account.body.entities, "audience", "tmdb:movie:550")).toBeTruthy();
    expect((await get("/api/accounts/not-an-account")).status).toBe(400);
  });
  it("hydrates a cold person account through the sync worker", async () => {
    const person = await get("/api/accounts/tmdb:person:819");
    expect(person.status).toBe(200);
    expect(person.body.views?.posts).toContain("tmdb:person:819~profile");
    expect(person.body.views?.posts).toContain("tmdb:person:819~photos");
    expect(person.body.views?.credits).toContain("tmdb:movie:550");
  });
  it("serves single posts and account search to visitors", async () => {
    const post = await get(`/api/posts/${encodeURIComponent(poster)}`);
    expect(post.status).toBe(200);
    expect(post.body.ids).toEqual([poster]);
    expect(post.body.views?.comments).toEqual([]);
    expect((await get(`/api/posts/${encodeURIComponent("tmdb:movie:550~nothing")}`)).status).toBe(
      404,
    );
    const search = await get("/api/search?q=ali");
    expect(search.status).toBe(200);
    expect(search.body.ids[0]).toBe(`user:${alice.id}`);
    const user = find(search.body.entities, "user", `user:${alice.id}`)!;
    expect(JSON.stringify(user)).not.toContain("@example.test");
  });
  it("streams public events to visitors", async () => {
    const controller = new AbortController();
    const res = await service.app.request("/api/events?cursor=0", { signal: controller.signal });
    expect(res.status).toBe(200);
    controller.abort();
  });
});

describe("member interactions", () => {
  it("requires a session and a matching origin for commands", async () => {
    expect((await send(undefined, { type: "like", postId: poster, like: true })).status).toBe(401);
    const res = await service.app.request("/api/command", {
      method: "POST",
      headers: {
        Cookie: alice.cookie,
        Origin: "https://untrusted.example",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        type: "like",
        postId: poster,
        like: true,
        operationId: crypto.randomUUID(),
      }),
    });
    expect(res.status).toBe(403);
  });
  it("counts likes idempotently and replays duplicate operations", async () => {
    const id = crypto.randomUUID();
    const first = await send(alice, { type: "like", postId: poster, like: true }, id);
    expect(first.status).toBe(200);
    expect(find(first.body.entities, "engagement", poster)?.data.likes).toBe(1);
    const replayed = await send(alice, { type: "like", postId: poster, like: true }, id);
    expect(replayed.body).toEqual(first.body);
    const conflicting = await send(alice, { type: "like", postId: poster, like: false }, id);
    expect(conflicting.status).toBe(409);
    const again = await send(alice, { type: "like", postId: poster, like: true });
    expect(find(again.body.entities, "engagement", poster)).toBeUndefined();
    const like = find(again.body.entities, "like", `${alice.id}|${poster}`)!;
    expect(like.data.active).toBe(true);
    expect(like.version).toBeGreaterThanOrEqual(
      find(first.body.entities, "like", `${alice.id}|${poster}`)!.version,
    );
    const post = await get(`/api/posts/${encodeURIComponent(poster)}`, alice);
    expect(find(post.body.entities, "engagement", poster)?.data.likes).toBe(1);
    expect(find(post.body.entities, "like", `${alice.id}|${poster}`)).toBeTruthy();
    const unliked = await send(alice, { type: "like", postId: poster, like: false });
    expect(find(unliked.body.entities, "engagement", poster)?.data.likes).toBe(0);
    expect(find(unliked.body.entities, "like", `${alice.id}|${poster}`)?.data.active).toBe(false);
  });
  it("keeps counters exact under concurrent likes", async () => {
    const members = [alice, bob, carol];
    await Promise.all(
      members.flatMap((m) => [
        send(m, { type: "like", postId: "tmdb:movie:550~backdrop", like: true }),
        send(m, { type: "like", postId: "tmdb:movie:550~backdrop", like: true }),
      ]),
    );
    const post = await get(`/api/posts/${encodeURIComponent("tmdb:movie:550~backdrop")}`);
    expect(find(post.body.entities, "engagement", "tmdb:movie:550~backdrop")?.data.likes).toBe(3);
  });
  it("rejects interactions with posts and accounts that do not exist", async () => {
    expect(
      (await send(alice, { type: "like", postId: "tmdb:movie:550~cast:x1", like: true })).status,
    ).toBe(404);
    expect(
      (await send(alice, { type: "follow", accountId: "tmdb:movie:999999", follow: true })).status,
    ).toBe(404);
    expect(
      (await send(alice, { type: "follow", accountId: `user:${alice.id}`, follow: true })).status,
    ).toBe(400);
  });
  it("follows catalog and member accounts with exact audience counts", async () => {
    const followed = await send(bob, {
      type: "follow",
      accountId: "tmdb:movie:550",
      follow: true,
    });
    expect(followed.status).toBe(200);
    expect(find(followed.body.entities, "audience", "tmdb:movie:550")?.data.followers).toBe(1);
    expect(find(followed.body.entities, "audience", `user:${bob.id}`)?.data.following).toBe(1);
    await send(bob, { type: "follow", accountId: `user:${alice.id}`, follow: true });
    const profile = await get(`/api/accounts/user:${alice.id}`, bob);
    expect(find(profile.body.entities, "audience", `user:${alice.id}`)?.data.followers).toBe(1);
    expect(find(profile.body.entities, "follow", `${bob.id}|user:${alice.id}`)).toBeTruthy();
    const state = await get<{ entities: Entity[]; viewer: string }>("/api/state", bob);
    expect(state.body.viewer).toBe(bob.id);
    expect(state.body.entities.filter((e) => e.kind === "follow")).toHaveLength(2);
    expect(JSON.stringify(state.body)).not.toContain("@example.test");
  });
  it("publishes member posts to profiles, community tabs and feeds", async () => {
    const created = await send(alice, {
      type: "post.create",
      body: "Rewatched this tonight",
      subjectId: "tmdb:movie:550",
      media: [{ type: "image", role: "backdrop", path: "/still-one.jpg", aspect: 1.778 }],
    });
    expect(created.status).toBe(200);
    const post = created.body.entities.find((e) => e.kind === "post")!;
    expect(post.data).toMatchObject({
      author: `user:${alice.id}`,
      subjects: ["tmdb:movie:550"],
      format: "image",
      origin: "user",
    });
    const profile = await get(`/api/accounts/user:${alice.id}`);
    expect(profile.body.views?.posts).toEqual([post.id]);
    expect(find(profile.body.entities, "audience", `user:${alice.id}`)?.data.posts).toBe(1);
    const community = await get("/api/accounts/tmdb:movie:550");
    expect(community.body.views?.community).toEqual([post.id]);
    const forYou = await get("/api/feed?feed=foryou");
    expect(forYou.body.ids).toContain(post.id);
    const following = await get("/api/feed?feed=following", bob);
    expect(following.body.ids[0]).toBe(post.id);
    expect(following.body.ids).toContain(poster);
    const visitor = await get("/api/feed?feed=following");
    expect(visitor.body).toMatchObject({ ids: [], coverage: { message: "signed-out" } });
    expect((await send(alice, { type: "post.create", body: "", media: [] })).status).toBe(400);
    expect((await send(bob, { type: "post.delete", postId: post.id })).status).toBe(403);
  });
  it("lets authors and post owners remove comments, nobody else", async () => {
    const [own] = await db.select().from(schema.posts).where(eq(schema.posts.authorId, alice.id));
    const comment = await send(bob, { type: "comment.create", postId: own!.id, body: "Same!" });
    expect(comment.status).toBe(200);
    const created = comment.body.entities.find((e) => e.kind === "comment")!;
    expect(find(comment.body.entities, "engagement", own!.id)?.data.comments).toBe(1);
    const read = await get(`/api/posts/${encodeURIComponent(own!.id)}`);
    expect(read.body.views?.comments).toEqual([created.id]);
    expect(find(read.body.entities, "user", `user:${bob.id}`)).toBeTruthy();
    expect((await send(carol, { type: "comment.delete", commentId: created.id })).status).toBe(403);
    const removed = await send(alice, { type: "comment.delete", commentId: created.id });
    expect(removed.status).toBe(200);
    expect(find(removed.body.entities, "engagement", own!.id)?.data.comments).toBe(0);
    const deleted = await send(alice, { type: "post.delete", postId: own!.id });
    expect(deleted.status).toBe(200);
    expect((await get(`/api/posts/${encodeURIComponent(own!.id)}`)).status).toBe(404);
  });
  it("updates public profiles", async () => {
    const saved = await send(carol, {
      type: "profile",
      name: "Carol C",
      username: "carol_c",
      bio: "Horror fan",
      image: "",
    });
    expect(saved.status).toBe(200);
    expect(find(saved.body.entities, "user", `user:${carol.id}`)).toMatchObject({
      title: "Carol C",
      data: { username: "carol_c", bio: "Horror fan" },
    });
  });
});

describe("ordered events", () => {
  it("replays public changes to everyone and private toggles only to their member", async () => {
    const cursor = Number(await currentCursor(db));
    await executeCommand(db, carol.id, {
      type: "like",
      postId: poster,
      like: true,
      operationId: crypto.randomUUID(),
    });
    const visitor = await replay(db, null, cursor);
    const owner = await replay(db, carol.id, cursor);
    const other = await replay(db, bob.id, cursor);
    expect(visitor.some((e) => e.payload.entities.some((x) => x.kind === "engagement"))).toBe(true);
    expect(visitor.some((e) => e.payload.entities.some((x) => x.kind === "like"))).toBe(false);
    expect(other.some((e) => e.payload.entities.some((x) => x.kind === "like"))).toBe(false);
    expect(owner.some((e) => e.payload.entities.some((x) => x.kind === "like"))).toBe(true);
    const ids = owner.map((e) => e.id);
    expect([...ids].sort((a, b) => a - b)).toEqual(ids);
  });
  it("keeps the required schema ready", async () => {
    await expect(assertDatabaseReady(db)).resolves.toBeUndefined();
  });
});
