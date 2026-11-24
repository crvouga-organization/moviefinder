import { desc, eq, sql } from "drizzle-orm";
import type { Database } from "./db";
import * as s from "./db/schema";
import type { Entity } from "../shared/contracts";
import { userAccount } from "../shared/contracts";
import { currentCursor } from "./events";
import { accountContext, followEntity, likeEntity, publicUser, userEntity } from "./social";

// The viewer's own state: their account, follows and recent likes. Signed-out visitors get an
// empty snapshot and the public event cursor.
export async function snapshot(db: Database, userId: string | null) {
  // Repeatable read pairs an internally consistent snapshot with its replay watermark.
  return db.transaction(async (tx) => {
    await tx.execute(sql`set transaction isolation level repeatable read read only`);
    const cursor = await currentCursor(tx);
    const entities: Entity[] = [];
    if (userId) {
      const [me] = await tx.select(publicUser).from(s.user).where(eq(s.user.id, userId));
      if (me) entities.push(userEntity(me));
      const follows = await tx
        .select({ targetId: s.follows.targetId, version: s.follows.version })
        .from(s.follows)
        .where(eq(s.follows.userId, userId))
        .limit(2000);
      entities.push(...follows.map((f) => followEntity(userId, f.targetId, f.version)));
      const likes = await tx
        .select({ postId: s.likes.postId, createdAt: s.likes.createdAt })
        .from(s.likes)
        .where(eq(s.likes.userId, userId))
        .orderBy(desc(s.likes.createdAt))
        .limit(1000);
      entities.push(...likes.map((l) => likeEntity(userId, l.postId, l.createdAt.getTime())));
      entities.push(...(await accountContext(tx, [userAccount(userId)], null)));
    }
    return { entities, cursor, viewer: userId };
  });
}
