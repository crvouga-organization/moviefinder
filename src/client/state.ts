import { useEffect, useSyncExternalStore } from "react";
import {
  createCollection,
  createOptimisticAction,
  eq,
  inArray,
  useLiveQuery,
} from "@tanstack/react-db";
import { queryCollectionOptions } from "@tanstack/query-db-collection";
import { QueryClient } from "@tanstack/react-query";
import { hc } from "hono/client";
import type { AppType } from "../server/app";
import { mergeEntity } from "../shared/detail-graph";
import {
  eventEnvelopeSchema,
  followKey,
  kinds,
  likeKey,
  userAccount,
  type Command,
  type Entity,
  type FeedRequest,
  type Kind,
  type QueryResult,
} from "../shared/contracts";
import { createOutbox } from "./outbox";
import { notices, report } from "./notifications";
import { RequestPool } from "./request-pool";
import {
  bindContext,
  bindNavigation,
  markNavigationContent,
  contextFor,
  count,
  gauge,
  measure,
  span,
  telemetryKey,
  track,
} from "./telemetry";
export { authClient } from "./auth-client";
export { notices, notify, report } from "./notifications";

export const api = hc<AppType>("/");
export const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});
const outbox = createOutbox(window.localStorage);

// ---- Viewer -------------------------------------------------------------------------------
// The signed-in member, or null for a visitor. Everything can be read signed out; interactions
// ask the visitor to sign in first.
let viewer: string | null = null;
const viewerListeners = new Set<() => void>();
export const currentViewer = () => viewer;
export function useViewer() {
  return useSyncExternalStore(
    (listener) => {
      viewerListeners.add(listener);
      return () => viewerListeners.delete(listener);
    },
    () => viewer,
  );
}
export class SignInRequired extends Error {
  constructor() {
    super("Sign in to continue");
  }
}
export function requestSignIn(reason: string) {
  notices.dispatchEvent(new CustomEvent("sign-in", { detail: reason }));
}

export async function readResponse<T>(res: Pick<Response, "ok" | "status" | "json">): Promise<T> {
  let data;
  try {
    data = await span("parse", "body", () => res.json(), contextFor(res));
    if (data && typeof data === "object") {
      bindContext(data, contextFor(res));
      if (Array.isArray(data.entities)) bindContext(data.entities, contextFor(res));
    }
  } catch {
    throw new Error("We couldn’t reach MovieFinder. Try again shortly.");
  }
  if (res.status === 401) {
    requestSignIn("Your session ended. Sign in again to continue.");
    throw new SignInRequired();
  }
  if (!res.ok) {
    const message =
      typeof data?.error === "string"
        ? data.error
        : Array.isArray(data?.error?.issues)
          ? data.error.issues[0]?.message
          : undefined;
    throw new Error(message ?? "This request could not be completed");
  }
  return data as T;
}

// ---- Canonical collections ----------------------------------------------------------------
type Snapshot = { entities: Entity[]; cursor: string; viewer: string | null };
let initialRequest: Promise<Snapshot> | undefined;
const loadSnapshot = () =>
  (initialRequest ??= span("snapshot", "load", () =>
    api.api.state.$get().then((r) => readResponse<Snapshot>(r)),
  ).catch((error) => {
    initialRequest = undefined;
    throw error;
  }));
function makeCollection(kind: Kind) {
  return createCollection(
    queryCollectionOptions<Entity>({
      id: `entities:${kind}`,
      queryKey: ["entities", kind],
      queryClient,
      getKey: (e) => e.id,
      queryFn: async () => (await loadSnapshot()).entities.filter((e) => e.kind === kind),
      staleTime: Infinity,
      gcTime: Infinity,
      retry: 1,
      refetchOnReconnect: false,
    }),
  );
}
export const collections = Object.fromEntries(
  kinds.map((kind) => [kind, makeCollection(kind)]),
) as Record<Kind, ReturnType<typeof makeCollection>>;
gauge(() => Object.fromEntries(kinds.map((kind) => [`n_${kind}`, collections[kind].size])));
const versions = new Map<string, number>();
let loaded: Promise<unknown> | undefined;
export const collectionsReady = () =>
  (loaded ??= Promise.all(Object.values(collections).map((c) => c.preload())).catch((error) => {
    loaded = undefined;
    throw error;
  }));

// Writes apply synchronously and wake every live query; issue them in one tick.
function applyMerge(entities: Entity[]) {
  const groups = new Map<Kind, Entity[]>();
  for (const e of entities) {
    const key = `${e.kind}:${e.id}`;
    const next = mergeEntity(collections[e.kind].get(e.id), e, versions.get(key) ?? -1);
    if (!next) continue;
    versions.set(key, e.version);
    groups.set(e.kind, [...(groups.get(e.kind) ?? []), next]);
  }
  return [...groups].map(([kind, values]) => {
    const unique = [...new Map(values.map((e) => [e.id, e])).values()];
    return measure(
      "merge",
      kind,
      () => collections[kind].utils.writeUpsert(unique),
      {
        entities: unique.length,
      },
      0,
    );
  });
}
function applyRemove(removed: { kind: Kind; id: string }[]) {
  return removed.flatMap((r) => {
    versions.set(`${r.kind}:${r.id}`, Infinity);
    return collections[r.kind].has(r.id) ? [collections[r.kind].utils.writeDelete(r.id)] : [];
  });
}
async function commit(change: {
  entities?: Entity[];
  removed?: { kind: Kind; id: string }[];
  view?: Entity;
}) {
  const began = performance.now();
  await collectionsReady();
  await Promise.all([
    ...applyMerge(change.entities ?? []),
    ...applyRemove(change.removed ?? []),
    ...(change.view ? [collections.query.utils.writeUpsert([change.view])] : []),
  ]);
  // Server reads carry their trace on the entity array, so merges join that request's trace.
  track("merge", "commit", {
    ...contextFor(change.entities),
    ms: performance.now() - began,
    entities: change.entities?.length ?? 0,
  });
}

export function useEntities(kind: Kind, ids: readonly string[]) {
  count(`render.useEntities.${kind}`);
  const result = useLiveQuery({
    queryKey: ["entity-view", kind, ids.join("|")],
    query: (q) =>
      q.from({ entity: collections[kind] }).where(({ entity }) => inArray(entity.id, [...ids])),
  });
  // Subscriptions attach asynchronously; read the same canonical rows meanwhile.
  const rows = result.isReady
    ? ((result.data ?? []) as Entity[])
    : ids.flatMap((id) => collections[kind].get(id) ?? []);
  const byId = new Map(rows.map((e) => [e.id, e]));
  return ids.flatMap((id) => byId.get(id) ?? []);
}
export const kindOf = (id: string): Kind =>
  id.startsWith("user:")
    ? "user"
    : id.startsWith("post:") || id.includes("~")
      ? "post"
      : id.includes(":episode:")
        ? "episode"
        : id.includes(":season:")
          ? "season"
          : ((id.split(":")[1] ?? "movie") as Kind);
export function useEntity(id: string | undefined, kind: Kind = kindOf(id ?? "")) {
  const result = useLiveQuery({
    queryKey: ["single-entity", kind, id ?? ""],
    query: (q) =>
      q.from({ entity: collections[kind] }).where(({ entity }) => eq(entity.id, id ?? "")),
  });
  return result.isReady ? result.data?.[0] : collections[kind].get(id ?? "");
}
export const useEngagement = (postId: string) => useEntity(postId, "engagement");
export const useAudience = (account: string) => useEntity(account, "audience");
export function useLiked(postId: string) {
  const me = useViewer();
  const like = useEntity(me ? likeKey(me, postId) : undefined, "like");
  return !!me && like?.data.active !== false && !!like;
}
export function useFollowing(account: string) {
  const me = useViewer();
  const follow = useEntity(me ? followKey(me, account) : undefined, "follow");
  return !!me && follow?.data.active !== false && !!follow;
}

// ---- Views --------------------------------------------------------------------------------
// A view is one server read (a feed page, an account, a post): its ordered IDs and coverage,
// stored as a `query` row. The entities it references live in their canonical collections.
export type View = {
  ids: string[];
  views: Record<string, string[]>;
  coverage: QueryResult["coverage"];
  error?: string;
};
export const viewOf = (entity: Entity | undefined): View | undefined =>
  entity ? (entity.data as View) : undefined;
export const requests = new RequestPool<string>(4, (event, fields) =>
  track("pool", event, {
    ...fields,
    key: typeof fields.key === "string" ? telemetryKey(fields.key) : undefined,
  }),
);
const subscriptions = new Map<string, Set<string>>();
const reloaders = new Map<string, () => Promise<unknown>>();
const ttlFor = (key: string) => {
  const state = viewOf(collections.query.get(key))?.coverage.state;
  return state === "complete" ? 60_000 : 3_000;
};
async function readView(key: string, fetcher: Fetcher, signal: AbortSignal) {
  try {
    const result = await readResponse<QueryResult>(await fetcher(signal));
    signal.throwIfAborted();
    for (const subscription of result.subscriptions ?? [])
      subscriptions.set(subscription, (subscriptions.get(subscription) ?? new Set()).add(key));
    await commit({
      entities: result.entities,
      view: {
        id: key,
        kind: "query",
        version: Date.now(),
        title: key,
        data: {
          ids: result.ids,
          views: result.views ?? {},
          coverage: result.coverage,
        } satisfies View,
      },
    });
  } catch (error) {
    if (signal.aborted) throw error;
    const held = viewOf(collections.query.get(key));
    await commit({
      view: {
        id: key,
        kind: "query",
        version: Date.now(),
        title: key,
        data: {
          ids: held?.ids ?? [],
          views: held?.views ?? {},
          coverage: held?.coverage ?? {
            state: "error",
            fetchedAt: null,
            nextCursor: null,
            unsupported: [],
          },
          error: error instanceof Error ? error.message : "This could not be loaded",
        } satisfies View,
      },
    });
  }
  return key;
}
type Fetcher = (signal: AbortSignal) => Promise<Pick<Response, "ok" | "status" | "json">>;
function load(key: string, fetcher: Fetcher, signal?: AbortSignal) {
  reloaders.set(key, () => load(key, fetcher));
  // A route's own read joins that navigation's trace and marks its content ready.
  const navigation = contextFor(signal);
  return requests.run(
    key,
    async (shared) => {
      if (navigation) bindContext(shared, navigation);
      const done = await readView(key, fetcher, shared);
      if (navigation) markNavigationContent(navigation);
      return done;
    },
    {
      signal,
      ttl: () => ttlFor(key),
    },
  );
}
const feedKey = (r: FeedRequest) => `feed:${r.feed}:${r.topic}:${r.cursor ?? ""}`;
export function loadFeed(request: FeedRequest, signal?: AbortSignal) {
  const key = feedKey(request);
  return load(
    key,
    (s) =>
      api.api.feed.$get(
        {
          query: {
            feed: request.feed,
            topic: request.topic,
            ...(request.cursor ? { cursor: request.cursor } : {}),
          },
        },
        { init: { signal: s } },
      ),
    signal,
  );
}
export const accountKey = (id: string) => `account:${id}`;
export const loadAccount = (id: string, signal?: AbortSignal) =>
  load(
    accountKey(id),
    (s) => api.api.accounts[":id"].$get({ param: { id } }, { init: { signal: s } }),
    signal,
  );
export const postKey = (id: string) => `post:${id}`;
export const loadPost = (id: string, signal?: AbortSignal) =>
  load(
    postKey(id),
    (s) => api.api.posts[":id"].$get({ param: { id } }, { init: { signal: s } }),
    signal,
  );
export const searchKey = (q: string) => `search:${q}`;
export const loadSearch = (q: string, signal?: AbortSignal) =>
  load(searchKey(q), (s) => api.api.search.$get({ query: { q } }, { init: { signal: s } }), signal);
export function useView(key: string | undefined) {
  return viewOf(useEntity(key, "query"));
}
// Reads a view on mount and whenever it becomes stale; the rows stay on screen meanwhile.
export function useLoad(key: string | undefined, run: (signal: AbortSignal) => Promise<unknown>) {
  useEffect(() => {
    if (!key) return;
    const controller = new AbortController();
    bindNavigation(controller.signal, location.href);
    void run(controller.signal).catch((error) => {
      if (!controller.signal.aborted) report(error);
    });
    return () => controller.abort();
  }, [key]);
}

// Accumulates a feed's pages into one ordered list. Existing posts never move: later pages and
// late provider results only append.
type FeedState = { keys: string[]; requests: FeedRequest[] };
const feeds = new Map<string, { state: FeedState; listeners: Set<() => void> }>();
const feedStore = (base: FeedRequest) => {
  const id = `${base.feed}:${base.topic}`;
  let store = feeds.get(id);
  if (!store) {
    store = { state: { keys: [feedKey(base)], requests: [base] }, listeners: new Set() };
    feeds.set(id, store);
  }
  return store;
};
export function useFeed(base: FeedRequest) {
  const store = feedStore(base);
  const state = useSyncExternalStore(
    (listener) => {
      store.listeners.add(listener);
      return () => store.listeners.delete(listener);
    },
    () => store.state,
  );
  const pages = useEntities("query", state.keys);
  useEffect(() => {
    const controller = new AbortController();
    for (const request of state.requests) void loadFeed(request, controller.signal).catch(() => {});
    return () => controller.abort();
  }, [state.requests]);
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const page of pages)
    for (const id of viewOf(page)?.ids ?? [])
      if (!seen.has(id)) {
        seen.add(id);
        ids.push(id);
      }
  const last = viewOf(pages[pages.length - 1]);
  const nextCursor = last?.coverage.nextCursor ?? null;
  const loading =
    pages.length < state.keys.length ||
    !last ||
    last.coverage.state === "missing" ||
    last.coverage.state === "partial";
  return {
    ids,
    loading,
    exhausted: !loading && !nextCursor,
    error: last?.error,
    message: last?.coverage.message,
    more: () => {
      if (!nextCursor || state.requests.some((r) => r.cursor === nextCursor)) return;
      const request = { ...base, cursor: nextCursor };
      store.state = {
        keys: [...state.keys, feedKey(request)],
        requests: [...state.requests, request],
      };
      for (const listener of store.listeners) listener();
    },
    retry: () => {
      const failed = state.requests[state.requests.length - 1]!;
      requests.invalidate((key) => key === feedKey(failed));
      void loadFeed(failed).catch(report);
    },
  };
}

// ---- Live updates -------------------------------------------------------------------------
let source: EventSource | undefined;
let started = false;
let queue = Promise.resolve();
let batch: string[] = [];
let batchTimer: ReturnType<typeof setTimeout> | undefined;
const reloads = new Map<string, ReturnType<typeof setTimeout>>();
function reloadSoon(key: string) {
  if (reloads.has(key)) return;
  reloads.set(
    key,
    setTimeout(() => {
      reloads.delete(key);
      requests.invalidate((k) => k === key);
      void reloaders.get(key)?.().catch(report);
    }, 300),
  );
}
export async function startSync() {
  if (started) return;
  started = true;
  try {
    const state = await loadSnapshot();
    await collectionsReady();
    viewer = state.viewer;
    for (const listener of viewerListeners) listener();
    for (const e of state.entities) versions.set(`${e.kind}:${e.id}`, e.version);
    if (viewer) for (const pending of outbox.read(viewer)) void run(pending).catch(report);
    let last = Number(state.cursor);
    source = new EventSource(`/api/events?cursor=${state.cursor}`);
    const apply = async (raw: string[]) => {
      const entities: Entity[] = [],
        removed: { kind: Kind; id: string }[] = [],
        changed = new Set<string>();
      for (const data of raw) {
        const event = eventEnvelopeSchema.parse(JSON.parse(data));
        if (Number(event.id) <= last) continue;
        last = Number(event.id);
        if (event.type === "reset") {
          versions.clear();
          for (const key of reloaders.keys()) changed.add(key);
        }
        entities.push(...event.entities);
        removed.push(...event.removed);
        for (const key of subscriptions.get(event.subscription) ?? []) changed.add(key);
      }
      await commit({ entities, removed });
      for (const key of changed) reloadSoon(key);
    };
    source.addEventListener("change", (message: MessageEvent) => {
      batch.push(message.data);
      batchTimer ??= setTimeout(() => {
        const raw = batch;
        batch = [];
        batchTimer = undefined;
        queue = queue.then(() => apply(raw)).catch(report);
      }, 40);
    });
  } catch (error) {
    started = false;
    throw error;
  }
}

// ---- Commands -----------------------------------------------------------------------------
const lanes = new Map<string, Promise<unknown>>();
function put(e: Entity) {
  const c = collections[e.kind];
  if (c.has(e.id)) c.update(e.id, (draft) => Object.assign(draft, e));
  else c.insert(e);
}
function bump(kind: "engagement" | "audience", id: string, field: string, by: number) {
  const held = collections[kind].get(id);
  put({
    id,
    kind,
    version: held?.version ?? 0,
    title: "",
    data: { ...held?.data, [field]: Math.max(0, Number(held?.data[field] ?? 0) + by) },
  });
}
function optimistic(command: Command, me: string) {
  switch (command.type) {
    case "like": {
      const id = likeKey(me, command.postId);
      const was = collections.like.get(id);
      if ((was?.data.active !== false && !!was) === command.like) return;
      put({
        id,
        kind: "like",
        version: Date.now(),
        title: "",
        data: { userId: me, postId: command.postId, active: command.like },
      });
      bump("engagement", command.postId, "likes", command.like ? 1 : -1);
      return;
    }
    case "follow": {
      const id = followKey(me, command.accountId);
      const was = collections.follow.get(id);
      if ((was?.data.active !== false && !!was) === command.follow) return;
      put({
        id,
        kind: "follow",
        version: Date.now(),
        title: "",
        data: { userId: me, targetId: command.accountId, active: command.follow },
      });
      bump("audience", command.accountId, "followers", command.follow ? 1 : -1);
      return;
    }
    case "comment.create": {
      put({
        id: command.operationId,
        kind: "comment",
        version: 0,
        title: command.body,
        data: {
          postId: command.postId,
          author: userAccount(me),
          body: command.body,
          at: new Date().toISOString(),
          pending: true,
        },
      });
      bump("engagement", command.postId, "comments", 1);
      const key = postKey(command.postId),
        view = collections.query.get(key);
      if (view)
        put({
          ...view,
          data: {
            ...view.data,
            views: {
              ...viewOf(view)?.views,
              comments: [command.operationId, ...(viewOf(view)?.views.comments ?? [])],
            },
          },
        });
      return;
    }
    case "comment.delete": {
      const comment = collections.comment.get(command.commentId);
      if (!comment) return;
      collections.comment.delete(command.commentId);
      bump("engagement", String(comment.data.postId), "comments", -1);
      return;
    }
    case "post.delete":
      if (collections.post.has(command.postId)) collections.post.delete(command.postId);
      bump("audience", userAccount(me), "posts", -1);
      return;
    case "profile": {
      const held = collections.user.get(userAccount(me));
      if (held)
        put({
          ...held,
          title: command.name,
          poster: command.image || null,
          overview: command.bio,
          data: {
            ...held.data,
            username: command.username,
            bio: command.bio,
            image: command.image,
          },
        });
      return;
    }
    default:
      return;
  }
}
async function run(value: Command) {
  const me = viewer;
  if (!me) throw new SignInRequired();
  outbox.put(me, value);
  let result: { entities: Entity[]; removed: { kind: Kind; id: string }[] } = {
    entities: [],
    removed: [],
  };
  const persist = async (c: Command) => {
    // One lane per target keeps a quick like/unlike in order.
    const key =
      "postId" in c ? `post:${c.postId}` : "accountId" in c ? `account:${c.accountId}` : `me`;
    const previous = lanes.get(key) ?? Promise.resolve();
    const pending = previous
      .catch(() => {})
      .then(async () => {
        let response: Awaited<ReturnType<typeof api.api.command.$post>>;
        try {
          response = await api.api.command.$post({ json: c }, { init: { keepalive: true } });
        } catch {
          // A transport retry reuses the operation ID; the server deduplicates it.
          response = await api.api.command.$post({ json: c }, { init: { keepalive: true } });
        }
        result = await readResponse(response);
        await commit(result);
        // Views that include this change refresh on their next read or by event.
        requests.invalidate(() => true);
      });
    lanes.set(key, pending);
    try {
      await pending;
      outbox.remove(me, c.operationId);
    } catch (error) {
      if (!(error instanceof TypeError)) outbox.remove(me, c.operationId);
      throw error;
    } finally {
      if (lanes.get(key) === pending) lanes.delete(key);
    }
  };
  const action = createOptimisticAction<Command>({
    onMutate: (c) => optimistic(c, me),
    mutationFn: persist,
  });
  const tx = action(value);
  if (tx.mutations.length === 0) await persist(value);
  else await tx.isPersisted.promise;
  return result;
}
export type CommandInput = Command extends infer C
  ? C extends { operationId: string }
    ? Omit<C, "operationId">
    : never
  : never;
// Interactions ask a visitor to sign in instead of failing.
export async function send(input: CommandInput, reason = "Sign in to join the conversation.") {
  if (!viewer) {
    requestSignIn(reason);
    throw new SignInRequired();
  }
  return run({ ...input, operationId: crypto.randomUUID() } as Command);
}
export function act(input: CommandInput, reason?: string) {
  void send(input, reason).catch((error) => {
    if (!(error instanceof SignInRequired)) report(error);
  });
}
