import { z } from "zod";
export const kinds = [
  "movie",
  "tv",
  "season",
  "episode",
  "person",
  "credit",
  "genre",
  "user",
  "post",
  "comment",
  "like",
  "follow",
  "engagement",
  "audience",
  "query",
] as const;
export type Kind = (typeof kinds)[number];
export type Entity = {
  id: string;
  kind: Kind;
  version: number;
  title: string;
  name?: string;
  overview?: string;
  poster?: string | null;
  backdrop?: string | null;
  year?: number;
  rating?: number;
  popularity?: number;
  genres?: string[];
  related?: string[];
  data: Record<string, unknown>;
};
export const canonicalId = (type: string, id: string | number) => `tmdb:${type}:${id}`;
export const sourceId = z
  .string()
  .regex(/^tmdb:(movie|tv|person):\d+(?::season:\d+(?::episode:\d+)?)?$/);
export const titleId = z.string().regex(/^tmdb:(movie|tv):\d+$/);

// Every account has a profile and a feed: movies, series, people and members.
export const catalogAccountId = z.string().regex(/^tmdb:(movie|tv|person):\d+$/);
export const userAccountId = z.string().regex(/^user:[A-Za-z0-9_-]{1,64}$/);
export const accountId = z.union([catalogAccountId, userAccountId]);
export type AccountKind = "movie" | "tv" | "person" | "user";
export const accountKind = (id: string): AccountKind =>
  id.startsWith("user:") ? "user" : (id.split(":")[1] as AccountKind);
export const userAccount = (userId: string) => `user:${userId}`;
export const userIdOf = (account: string) =>
  account.startsWith("user:") ? account.slice("user:".length) : undefined;

// Catalog posts are derived from an account's source record: `tmdb:movie:550~poster`.
// Member posts are stored rows: `post:<uuid>`.
export const postId = z
  .string()
  .max(200)
  .regex(/^(?:tmdb:(?:movie|tv|person):\d+~[a-z]+(?::[A-Za-z0-9_-]{1,80})?|post:[0-9a-f-]{36})$/);
export const postAccount = (id: string) => (id.startsWith("post:") ? undefined : id.split("~")[0]);

export const imageRoles = ["poster", "profile", "still", "backdrop"] as const;
export const imagePath = z.string().regex(/^\/[A-Za-z0-9_-]{1,80}\.(?:jpg|jpeg|png|webp|svg)$/);
export const postMedia = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("image"),
    role: z.enum(imageRoles),
    path: imagePath,
    // Width / height. Reserves the frame before the artwork arrives.
    aspect: z.number().positive().max(10),
    link: accountId.optional(),
    label: z.string().max(200).optional(),
  }),
  z.object({
    type: z.literal("video"),
    key: z.string().regex(/^[A-Za-z0-9_-]{6,20}$/),
    name: z.string().max(200),
    thumb: imagePath.optional(),
  }),
]);
export type PostMedia = z.infer<typeof postMedia>;
export type PostFormat = "image" | "gallery" | "video" | "text";
export type PostData = {
  author: string;
  subjects: string[];
  format: PostFormat;
  media: PostMedia[];
  caption: string;
  at: string | null;
  origin: "catalog" | "user";
};
export const postData = (post: Entity | undefined): PostData | undefined =>
  post?.kind === "post" ? (post.data as PostData) : undefined;

export const engagementOf = (entity: Entity | undefined) => ({
  likes: Number(entity?.data.likes ?? 0),
  comments: Number(entity?.data.comments ?? 0),
});
export const audienceOf = (entity: Entity | undefined) => ({
  followers: Number(entity?.data.followers ?? 0),
  following: Number(entity?.data.following ?? 0),
  posts: Number(entity?.data.posts ?? 0),
});
export const likeKey = (userId: string, post: string) => `${userId}|${post}`;
export const followKey = (userId: string, account: string) => `${userId}|${account}`;

const csvNumbers = z.preprocess(
  (v) => (typeof v === "string" ? v.split(",").filter(Boolean).map(Number) : v),
  z
    .array(z.number().int().positive())
    .max(30)
    .default([])
    .transform((values) => [...new Set(values)].sort((a, b) => a - b)),
);
const optionalNumber = z.preprocess(
  (v) => (v === "" || v == null ? undefined : Number(v)),
  z.number().finite().optional(),
);
const optionalText = (schema: z.ZodType<string>) =>
  z.preprocess((v) => (v === "" ? undefined : v), schema.optional());
// Catalog discovery parameters. Feeds use them to ask the provider for the titles behind posts.
export const feedParams = z
  .object({
    type: z.enum(["movie", "tv", "both"]).default("both"),
    sort: z
      .enum(["popularity", "rating", "lowest", "newest", "oldest", "trending", "random"])
      .default("popularity"),
    genres: csvNumbers,
    excludeGenres: csvNumbers,
    yearMin: optionalNumber.pipe(z.number().int().min(0).max(3000).optional()),
    yearMax: optionalNumber.pipe(z.number().int().min(0).max(3000).optional()),
    dateMin: optionalText(z.iso.date()),
    dateMax: optionalText(z.iso.date()),
    runtimeMin: optionalNumber.pipe(z.number().nonnegative().optional()),
    runtimeMax: optionalNumber.pipe(z.number().nonnegative().optional()),
    language: optionalText(z.string().regex(/^[a-z]{2}$/)),
    country: optionalText(z.string().regex(/^[A-Z]{2}$/)),
    ratingMin: optionalNumber.pipe(z.number().min(0).max(10).optional()),
    ratingMax: optionalNumber.pipe(z.number().min(0).max(10).optional()),
    votesMin: optionalNumber.pipe(z.number().int().nonnegative().optional()),
    popularityMin: optionalNumber.pipe(z.number().nonnegative().optional()),
    popularityMax: optionalNumber.pipe(z.number().nonnegative().optional()),
    cast: csvNumbers,
    crew: csvNumbers,
    keywords: csvNumbers,
    providers: csvNumbers,
    region: z
      .string()
      .regex(/^[A-Z]{2}$/)
      .default("US"),
    q: z.string().trim().max(200).default(""),
    cursor: z.string().max(600).optional(),
    seed: z.string().max(100).default("discover"),
    exclude: z.preprocess(
      (v) => (typeof v === "string" ? v.split(",").filter(Boolean) : v),
      z.array(sourceId).max(200).default([]),
    ),
  })
  .refine(
    (p) => p.yearMin == null || p.yearMax == null || p.yearMin <= p.yearMax,
    "The year range is reversed",
  )
  .refine(
    (p) => p.ratingMin == null || p.ratingMax == null || p.ratingMin <= p.ratingMax,
    "The rating range is reversed",
  )
  .refine((p) => !p.dateMin || !p.dateMax || p.dateMin <= p.dateMax, "The date range is reversed")
  .refine(
    (p) => p.runtimeMin == null || p.runtimeMax == null || p.runtimeMin <= p.runtimeMax,
    "The runtime range is reversed",
  )
  .refine(
    (p) => p.popularityMin == null || p.popularityMax == null || p.popularityMin <= p.popularityMax,
    "The popularity range is reversed",
  );
export type FeedParams = z.infer<typeof feedParams>;

// Feed topics are the chips above For You and Explore.
export const topics = [
  { id: "all", label: "All" },
  { id: "movie", label: "Movies" },
  { id: "tv", label: "TV" },
  { id: "28", label: "Action" },
  { id: "35", label: "Comedy" },
  { id: "18", label: "Drama" },
  { id: "27", label: "Horror" },
  { id: "878", label: "Sci‑fi" },
  { id: "16", label: "Animation" },
  { id: "99", label: "Documentary" },
] as const;
export const topic = z.enum(topics.map((t) => t.id) as [string, ...string[]]).default("all");
export const feedKind = z.enum(["foryou", "following", "explore"]);
export type FeedKind = z.infer<typeof feedKind>;
export const feedRequest = z.object({
  feed: feedKind.default("foryou"),
  topic,
  cursor: z.string().max(800).optional(),
});
export type FeedRequest = z.infer<typeof feedRequest>;
export const accountTabs = ["posts", "videos", "community", "cast", "related", "credits", "likes"];
export const accountTab = z.enum(accountTabs as [string, ...string[]]);

export function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${JSON.stringify(k)}:${stableSerialize(v)}`)
      .join(",")}}`;
  return JSON.stringify(value) ?? "null";
}
export type Coverage = {
  state: "missing" | "partial" | "complete" | "stale" | "error";
  projection?: "viewport";
  // A previously complete provider page can remain usable when a refresh fails.
  complete?: boolean;
  fetchedAt: string | null;
  nextCursor: string | null;
  message?: string;
  unsupported: string[];
};
export type QueryResult = {
  id: string;
  entities: Entity[];
  ids: string[];
  coverage: Coverage;
  // Event subscriptions whose changes make this read stale.
  subscriptions?: string[];
  // Named secondary id lists, such as an account's tabs or a post's comments.
  views?: Record<string, string[]>;
  included?: { id: string; ids: string[]; coverage: Coverage }[];
};
export type EventEnvelope = {
  protocol: 1;
  id: string;
  type: "upsert" | "remove" | "reset" | "complete";
  subscription: string;
  entities: Entity[];
  removed: { kind: Kind; id: string }[];
  timestamp: string;
};
const meta = { operationId: z.uuid() };
export const commandSchema = z.discriminatedUnion("type", [
  z.object({ ...meta, type: z.literal("like"), postId, like: z.boolean() }),
  z.object({ ...meta, type: z.literal("follow"), accountId, follow: z.boolean() }),
  z.object({
    ...meta,
    type: z.literal("comment.create"),
    postId,
    body: z.string().trim().min(1).max(1000),
  }),
  z.object({ ...meta, type: z.literal("comment.delete"), commentId: z.uuid() }),
  z.object({
    ...meta,
    type: z.literal("post.create"),
    body: z.string().trim().max(2000),
    subjectId: catalogAccountId.optional(),
    media: z.array(postMedia).max(10).default([]),
  }),
  z.object({ ...meta, type: z.literal("post.delete"), postId: z.string().regex(/^post:/) }),
  z.object({
    ...meta,
    type: z.literal("profile"),
    name: z.string().trim().min(1).max(100),
    username: z.string().regex(/^[a-zA-Z0-9_]{3,30}$/),
    bio: z.string().max(500),
    image: z.union([
      z.url().refine((v) => v.startsWith("https://"), "Use an HTTPS image URL"),
      z.literal(""),
    ]),
  }),
]);
export type Command = z.infer<typeof commandSchema>;
export function safeReturnTo(value: string | null | undefined) {
  return value?.startsWith("/") &&
    !value.startsWith("//") &&
    !value.startsWith("/auth") &&
    !/[\\\r\n]/.test(value)
    ? value
    : "/";
}
export function mergeEvent(versions: Map<string, number>, event: EventEnvelope): Entity[] {
  return event.entities.filter((e) => {
    const key = `${e.kind}:${e.id}`;
    if ((versions.get(key) ?? -1) >= e.version) return false;
    versions.set(key, e.version);
    return true;
  });
}

export function fieldText(value: unknown): string {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean"
    ? String(value)
    : "";
}

export const entitySchema: z.ZodType<Entity> = z.object({
  id: z.string(),
  kind: z.enum(kinds),
  version: z.number().int().nonnegative(),
  title: z.string(),
  name: z.string().optional(),
  overview: z.string().optional(),
  poster: z.string().nullable().optional(),
  backdrop: z.string().nullable().optional(),
  year: z.number().optional(),
  rating: z.number().optional(),
  popularity: z.number().optional(),
  genres: z.array(z.string()).optional(),
  related: z.array(z.string()).optional(),
  data: z.record(z.string(), z.unknown()),
});
export const eventEnvelopeSchema: z.ZodType<EventEnvelope> = z.object({
  protocol: z.literal(1),
  id: z.string().regex(/^\d+$/),
  type: z.enum(["upsert", "remove", "reset", "complete"]),
  subscription: z.string(),
  entities: z.array(entitySchema),
  removed: z.array(z.object({ kind: z.enum(kinds), id: z.string() })),
  timestamp: z.iso.datetime(),
});
