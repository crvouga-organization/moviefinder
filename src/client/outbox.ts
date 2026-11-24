import { commandSchema, type Command } from "../shared/contracts";
// Commands survive a reload until the server confirms them; replays reuse the operation ID.
export function createOutbox(storage: Pick<Storage, "getItem" | "setItem" | "removeItem">) {
  const key = (userId: string) => `moviefinder:commands:${userId}`;
  function read(userId: string): Command[] {
    try {
      const parsed: unknown = JSON.parse(storage.getItem(key(userId)) ?? "[]");
      if (!Array.isArray(parsed)) return [];
      return parsed.slice(0, 100).flatMap((value) => {
        const result = commandSchema.safeParse(value);
        return result.success ? [result.data] : [];
      });
    } catch {
      return [];
    }
  }
  function write(userId: string, commands: Command[]) {
    if (commands.length) storage.setItem(key(userId), JSON.stringify(commands));
    else storage.removeItem(key(userId));
  }
  return {
    read,
    put(userId: string, command: Command) {
      const pending = read(userId);
      if (pending.some((c) => c.operationId === command.operationId)) return;
      if (pending.length >= 100)
        throw new Error("Your pending changes need to finish syncing before you can add more.");
      write(userId, [...pending, command]);
    },
    remove(userId: string, id: string) {
      write(
        userId,
        read(userId).filter((c) => c.operationId !== id),
      );
    },
  };
}
