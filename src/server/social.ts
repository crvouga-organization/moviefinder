import { and, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import type { Executor } from "./db";
import * as s from "./db/schema";
import {
  followKey,
  likeKey,
  postMedia,
  userAccount,
  type Entity,
  type PostData,
} from "../shared/contracts";

// Public projections of member data. Email addresses, sessions and tokens never leave here.
export const publicUser = {
  id: s.user.id,
  name: s.user.name,
  username: s.user.username,
  bio: s.user.bio,
  image: s.user.image,
  createdAt: s.user.createdAt,
  updatedAt: s.user.updatedAt,
};
export type PublicUser = { [K in keyof typeof publicUser]: (typeof s.user.$inferSelect)[K] };

export function userEntity(row: PublicUser): Entity {
  return {
    id: userAccount(row.id),
    kind: "user",
    version: row.updatedAt.getTime(),
    title: row.name,
    poster: row.image || null,
    overview: row.bio,
    data: {
      userId: row.id,
      username: row.username,
      bio: row.bio,
      image: row.image,
      joined: row.createdAt.toISOString(),
    },
  };
}
export function memberPost(row: typeof s.posts.$inferSelect): Entity {
  const media = (Array.isArray(row.media) ? row.media : []).flatMap((m) => {
    const parsed = postMedia.safeParse(m);
    return parsed.success ? [parsed.data] : [];
  });
  const data: PostData = {
    author: userAccount(row.authorId),
    subjects: row.subjectId ? [row.subjectId] : [],
    format:
      media.length > 1
        ? "gallery"
        : media[0]?.type === "video"
          ? "video"
          : media.length
            ? "image"
            : "text",
    media,
    caption: row.body,
    at: row.createdAt.toISOString(),
    origin: "user",
  };
  return { id: row.id, kind: "post", version: row.version, title: row.body.slice(0, 80), data };
}
export function commentEntity(row: typeof s.comments.$inferSelect): Entity {
  return {
    id: row.id,
    kind: "comment",
    version: row.version,
    title: row.body,
    data: {
      postId: row.postId,
      author: userAccount(row.userId),
      body: row.body,
      at: row.createdAt.toISOString(),
    },
  };
}
export const engagementEntity = (
  postId: string,
  row?: { likes: number; comments: number; version: number },
): Entity => ({
  id: postId,
  kind: "engagement",
  version: row?.version ?? 0,
  title: "",
  data: { likes: row?.likes ?? 0, comments: row?.comments ?? 0 },
});
export const audienceEntity = (
  account: string,
  row?: { followers: number; following: number; posts: number; version: number },
): Entity => ({
  id: account,
  kind: "audience",
  version: row?.version ?? 0,
  title: "",
  data: { followers: row?.followers ?? 0, following: row?.following ?? 0, posts: row?.posts ?? 0 },
});
// Likes and follows toggle, so an undo is a newer inactive version rather than a removal; a
// late event for an earlier like can then never resurrect it.
export const likeEntity = (
  userId: string,
  postId: string,
  version: number,
  active = true,
): Entity => ({
  id: likeKey(userId, postId),
  kind: "like",
  version,
  title: "",
  data: { userId, postId, active },
});
export const followEntity = (
  userId: string,
  account: string,
  version: number,
  active = true,
): Entity => ({
  id: followKey(userId, account),
  kind: "follow",
  version,
  title: "",
  data: { userId, targetId: account, active },
});

// Counters, authors and the viewer's own likes/follows for a page of posts or accounts.
export async function postContext(
  db: Executor,
  posts: Entity[],
  viewer: string | null,
): Promise<Entity[]> {
  const ids = [...new Set(posts.map((p) => p.id))];
  if (!ids.length) return [];
  const counters = await db.select().from(s.engagement).where(inArray(s.engagement.postId, ids));
  const byPost = new Map(counters.map((c) => [c.postId, c]));
  const out: Entity[] = ids.map((id) => engagementEntity(id, byPost.get(id)));
  if (viewer) {
    const liked = await db
      .select({ postId: s.likes.postId, createdAt: s.likes.createdAt })
      .from(s.likes)
      .where(and(eq(s.likes.userId, viewer), inArray(s.likes.postId, ids)));
    out.push(...liked.map((l) => likeEntity(viewer, l.postId, l.createdAt.getTime())));
  }
  const members = [
    ...new Set(
      posts
        .map((p) => (p.data as PostData).author)
        .filter((a) => a.startsWith("user:"))
        .map((a) => a.slice(5)),
    ),
  ];
  if (members.length)
    out.push(
      ...(await db.select(publicUser).from(s.user).where(inArray(s.user.id, members))).map(
        userEntity,
      ),
    );
  return out;
}
export async function accountContext(
  db: Executor,
  accounts: string[],
  viewer: string | null,
): Promise<Entity[]> {
  const ids = [...new Set(accounts)];
  if (!ids.length) return [];
  const rows = await db.select().from(s.accountStats).where(inArray(s.accountStats.accountId, ids));
  const byId = new Map(rows.map((r) => [r.accountId, r]));
  const out = ids.map((id) => audienceEntity(id, byId.get(id)));
  if (viewer) {
    const followed = await db
      .select({ targetId: s.follows.targetId, version: s.follows.version })
      .from(s.follows)
      .where(and(eq(s.follows.userId, viewer), inArray(s.follows.targetId, ids)));
    out.push(...followed.map((f) => followEntity(viewer, f.targetId, f.version)));
  }
  return out;
}
export async function searchUsers(db: Executor, q: string, limit = 20) {
  const pattern = `%${q.replace(/[%_\\]/g, "\\$&")}%`;
  return (
    await db
      .select(publicUser)
      .from(s.user)
      .where(or(ilike(s.user.name, pattern), ilike(s.user.username, pattern)))
      .orderBy(s.user.name, s.user.id)
      .limit(limit)
  ).map(userEntity);
}
export async function recentMemberPosts(
  db: Executor,
  options: { authors?: string[]; subjects?: string[]; offset?: number; limit: number },
) {
  const filters = [
    options.authors?.length ? inArray(s.posts.authorId, options.authors) : undefined,
    options.subjects?.length ? inArray(s.posts.subjectId, options.subjects) : undefined,
  ].filter((f) => !!f);
  if ((options.authors || options.subjects) && !filters.length) return [];
  return (
    await db
      .select()
      .from(s.posts)
      .where(filters.length ? or(...filters) : undefined)
      .orderBy(desc(s.posts.createdAt), desc(s.posts.id))
      .offset(options.offset ?? 0)
      .limit(options.limit)
  ).map(memberPost);
}
export async function likedPostIds(db: Executor, userId: string, offset: number, limit: number) {
  return (
    await db
      .select({ postId: s.likes.postId })
      .from(s.likes)
      .where(eq(s.likes.userId, userId))
      .orderBy(desc(s.likes.createdAt), s.likes.postId)
      .offset(offset)
      .limit(limit)
  ).map((r) => r.postId);
}
export async function bumpEngagement(
  tx: Executor,
  postId: string,
  delta: { likes?: number; comments?: number },
) {
  const [row] = await tx
    .insert(s.engagement)
    .values({
      postId,
      likes: Math.max(0, delta.likes ?? 0),
      comments: Math.max(0, delta.comments ?? 0),
    })
    .onConflictDoUpdate({
      target: s.engagement.postId,
      set: {
        likes: sql`greatest(0, ${s.engagement.likes} + ${delta.likes ?? 0})`,
        comments: sql`greatest(0, ${s.engagement.comments} + ${delta.comments ?? 0})`,
        version: sql`${s.engagement.version} + 1`,
      },
    })
    .returning();
  return engagementEntity(postId, row);
}
export async function bumpAudience(
  tx: Executor,
  account: string,
  delta: { followers?: number; following?: number; posts?: number },
) {
  const [row] = await tx
    .insert(s.accountStats)
    .values({
      accountId: account,
      followers: Math.max(0, delta.followers ?? 0),
      following: Math.max(0, delta.following ?? 0),
      posts: Math.max(0, delta.posts ?? 0),
    })
    .onConflictDoUpdate({
      target: s.accountStats.accountId,
      set: {
        followers: sql`greatest(0, ${s.accountStats.followers} + ${delta.followers ?? 0})`,
        following: sql`greatest(0, ${s.accountStats.following} + ${delta.following ?? 0})`,
        posts: sql`greatest(0, ${s.accountStats.posts} + ${delta.posts ?? 0})`,
        version: sql`${s.accountStats.version} + 1`,
      },
    })
    .returning();
  return audienceEntity(account, row);
}
