import { and, eq, sql } from "drizzle-orm";
import type { Database, Executor } from "./db";
import * as s from "./db/schema";
import {
  accountKind,
  followKey,
  postAccount,
  stableSerialize,
  userAccount,
  userIdOf,
  type Command,
  type Entity,
  type Kind,
} from "../shared/contracts";
import { digest } from "./entity-store";
import { appendEvent } from "./events";
import { AppError } from "./log";
import { catalogPostsFor } from "./posts";
import {
  bumpAudience,
  bumpEngagement,
  commentEntity,
  followEntity,
  likeEntity,
  memberPost,
  publicUser,
  userEntity,
} from "./social";

async function postExists(tx: Executor, postId: string) {
  if (postId.startsWith("post:")) {
    const [row] = await tx.select({ id: s.posts.id }).from(s.posts).where(eq(s.posts.id, postId));
    return !!row;
  }
  const account = postAccount(postId);
  if (!account) return false;
  const [row] = await tx.select().from(s.sources).where(eq(s.sources.id, account));
  return !!row && catalogPostsFor(row).some((p) => p.id === postId);
}
async function accountExists(tx: Executor, account: string) {
  const member = userIdOf(account);
  if (member) {
    const [row] = await tx.select({ id: s.user.id }).from(s.user).where(eq(s.user.id, member));
    return !!row;
  }
  const [row] = await tx
    .select({ id: s.sources.id })
    .from(s.sources)
    .where(eq(s.sources.id, account));
  return !!row;
}

export async function executeCommand(db: Database, userId: string, command: Command) {
  return db.transaction(async (tx) => {
    // Global commit order lock also makes duplicated operation IDs safe across replicas.
    await tx.execute(sql`select pg_advisory_xact_lock(636712031)`);
    const fingerprint = digest(stableSerialize(command));
    const [previous] = await tx
      .select()
      .from(s.operations)
      .where(and(eq(s.operations.userId, userId), eq(s.operations.id, command.operationId)));
    if (previous) {
      if (previous.fingerprint !== fingerprint)
        throw new AppError(409, "Operation ID already belongs to another command");
      return previous.result;
    }
    // Counters, posts and comments are public; the viewer's own likes and follows are private.
    const shared: Entity[] = [],
      personal: Entity[] = [],
      sharedRemoved: { kind: Kind; id: string }[] = [],
      personalRemoved: { kind: Kind; id: string }[] = [];
    let subscription = `user:${userId}`;
    // Toggle versions: later than any earlier state of the same like or follow.
    const now = Date.now();
    switch (command.type) {
      case "like": {
        if (!(await postExists(tx, command.postId)))
          throw new AppError(404, "This post is no longer available");
        subscription = `post:${command.postId}`;
        const changed = command.like
          ? (
              await tx
                .insert(s.likes)
                .values({ userId, postId: command.postId, createdAt: new Date(now) })
                .onConflictDoNothing()
                .returning()
            ).length
          : (
              await tx
                .delete(s.likes)
                .where(and(eq(s.likes.userId, userId), eq(s.likes.postId, command.postId)))
                .returning()
            ).length;
        if (changed)
          shared.push(await bumpEngagement(tx, command.postId, { likes: command.like ? 1 : -1 }));
        personal.push(likeEntity(userId, command.postId, now, command.like));
        break;
      }
      case "follow": {
        if (command.accountId === userAccount(userId))
          throw new AppError(400, "You can’t follow yourself");
        if (!(await accountExists(tx, command.accountId)))
          throw new AppError(404, "This account is no longer available");
        subscription = `account:${command.accountId}`;
        const changed = command.follow
          ? (
              await tx
                .insert(s.follows)
                .values({
                  id: followKey(userId, command.accountId),
                  userId,
                  targetId: command.accountId,
                  targetKind: accountKind(command.accountId),
                  version: now,
                })
                .onConflictDoNothing()
                .returning()
            ).length
          : (
              await tx
                .delete(s.follows)
                .where(and(eq(s.follows.userId, userId), eq(s.follows.targetId, command.accountId)))
                .returning()
            ).length;
        if (changed) {
          const delta = command.follow ? 1 : -1;
          shared.push(await bumpAudience(tx, command.accountId, { followers: delta }));
          shared.push(await bumpAudience(tx, userAccount(userId), { following: delta }));
        }
        personal.push(followEntity(userId, command.accountId, now, command.follow));
        break;
      }
      case "comment.create": {
        if (!(await postExists(tx, command.postId)))
          throw new AppError(404, "This post is no longer available");
        subscription = `post:${command.postId}`;
        const [row] = await tx
          .insert(s.comments)
          .values({ id: command.operationId, postId: command.postId, userId, body: command.body })
          .returning();
        shared.push(commentEntity(row!));
        shared.push(await bumpEngagement(tx, command.postId, { comments: 1 }));
        const [author] = await tx.select(publicUser).from(s.user).where(eq(s.user.id, userId));
        if (author) shared.push(userEntity(author));
        break;
      }
      case "comment.delete": {
        const [comment] = await tx
          .select()
          .from(s.comments)
          .where(eq(s.comments.id, command.commentId));
        if (!comment) throw new AppError(404, "This comment was already removed");
        const [post] = comment.postId.startsWith("post:")
          ? await tx.select().from(s.posts).where(eq(s.posts.id, comment.postId))
          : [];
        if (comment.userId !== userId && post?.authorId !== userId)
          throw new AppError(403, "Only the comment’s author can remove it");
        subscription = `post:${comment.postId}`;
        await tx.delete(s.comments).where(eq(s.comments.id, comment.id));
        sharedRemoved.push({ kind: "comment", id: comment.id });
        shared.push(await bumpEngagement(tx, comment.postId, { comments: -1 }));
        break;
      }
      case "post.create": {
        if (!command.body && !command.media.length)
          throw new AppError(400, "Write something or add artwork to post");
        if (command.subjectId && !(await accountExists(tx, command.subjectId)))
          throw new AppError(404, "The tagged title or person is no longer available");
        subscription = "posts";
        const [row] = await tx
          .insert(s.posts)
          .values({
            id: `post:${command.operationId}`,
            authorId: userId,
            body: command.body,
            subjectId: command.subjectId ?? null,
            media: command.media,
          })
          .returning();
        shared.push(memberPost(row!));
        shared.push(await bumpAudience(tx, userAccount(userId), { posts: 1 }));
        const [author] = await tx.select(publicUser).from(s.user).where(eq(s.user.id, userId));
        if (author) shared.push(userEntity(author));
        break;
      }
      case "post.delete": {
        const [post] = await tx.select().from(s.posts).where(eq(s.posts.id, command.postId));
        if (!post) throw new AppError(404, "This post was already removed");
        if (post.authorId !== userId) throw new AppError(403, "Only the author can delete a post");
        subscription = "posts";
        await tx.delete(s.posts).where(eq(s.posts.id, post.id));
        await tx.delete(s.comments).where(eq(s.comments.postId, post.id));
        await tx.delete(s.likes).where(eq(s.likes.postId, post.id));
        await tx.delete(s.engagement).where(eq(s.engagement.postId, post.id));
        sharedRemoved.push({ kind: "post", id: post.id }, { kind: "engagement", id: post.id });
        shared.push(await bumpAudience(tx, userAccount(userId), { posts: -1 }));
        break;
      }
      case "profile": {
        const [row] = await tx
          .update(s.user)
          .set({
            name: command.name,
            username: command.username.toLowerCase(),
            displayUsername: command.username,
            bio: command.bio,
            image: command.image || null,
            updatedAt: new Date(),
          })
          .where(eq(s.user.id, userId))
          .returning(publicUser);
        if (row) shared.push(userEntity(row));
        subscription = `account:${userAccount(userId)}`;
        break;
      }
    }
    if (shared.length || sharedRemoved.length)
      await appendEvent(tx, subscription, shared, sharedRemoved, null);
    if (personal.length || personalRemoved.length)
      await appendEvent(tx, `viewer:${userId}`, personal, personalRemoved, userId);
    const result = {
      entities: [...shared, ...personal],
      removed: [...sharedRemoved, ...personalRemoved],
    };
    await tx.insert(s.operations).values({ userId, id: command.operationId, fingerprint, result });
    return result;
  });
}
