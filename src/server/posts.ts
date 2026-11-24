import type { sources } from "./db/schema";
import { normalize, summaryOf } from "./entity-store/normalize";
import { catalogPosts } from "../shared/posts";
import type { Entity } from "../shared/contracts";

type SourceRow = typeof sources.$inferSelect;
// Posts published by a cached catalog account. A summary row yields its artwork posts; a
// hydrated row adds trailers, galleries, cast and seasons.
export function catalogPostsFor(row: SourceRow): Entity[] {
  const graph =
    row.projection === "detail"
      ? normalize(row.id, row.payload, row.version)
      : summaryOf(row.id, row.payload, row.version);
  const byId = new Map(graph.map((e) => [e.id, e]));
  const root = byId.get(row.id);
  return root ? catalogPosts(root, (id) => byId.get(id)) : [];
}
// The account entity a post or profile header shows, without its relation graph.
export function accountSummary(row: SourceRow): Entity | undefined {
  return summaryOf(row.id, row.payload, row.version)[0];
}
