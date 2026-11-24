import type { Entity, PostData, PostMedia } from "./contracts";
import { fieldText } from "./contracts";
import { entityIds } from "./detail-graph";

// Catalog accounts publish posts derived from their source record: artwork, galleries,
// trailers, cast and filmography. Derivation is deterministic, so a post keeps its identity,
// likes and comments across refreshes. Summaries yield the artwork posts; details add the rest.

type Image = { path: string; aspect?: number };
const images = (root: Entity, key: string): Image[] => {
  const sets = (root.data.images ?? {}) as Record<string, unknown>;
  const list = sets[key];
  return Array.isArray(list)
    ? list.filter((i): i is Image => !!i && typeof (i as Image).path === "string")
    : [];
};
const caption = (text: unknown, limit = 600) => {
  const value = fieldText(text).trim();
  return value.length > limit ? `${value.slice(0, limit - 1).trimEnd()}…` : value;
};
const heading = (root: Entity) => (root.year ? `${root.title} (${root.year})` : root.title);

function post(
  root: Entity,
  slug: string,
  title: string,
  format: PostData["format"],
  media: PostMedia[],
  text: string,
  subjects: string[] = [],
): Entity {
  const data: PostData = {
    author: root.id,
    subjects,
    format,
    media,
    caption: text,
    at: fieldText(root.data.releaseDate) || null,
    origin: "catalog",
  };
  return { id: `${root.id}~${slug}`, kind: "post", version: root.version, title, data };
}

export function catalogPosts(root: Entity, get: (id: string) => Entity | undefined): Entity[] {
  if (root.kind !== "movie" && root.kind !== "tv" && root.kind !== "person") return [];
  const out: Entity[] = [];
  const name = heading(root);
  if (root.kind === "person") {
    if (root.poster)
      out.push(
        post(
          root,
          "profile",
          root.title,
          "image",
          [{ type: "image", role: "profile", path: root.poster, aspect: 2 / 3 }],
          caption(root.overview, 400),
        ),
      );
    const photos = images(root, "profiles").slice(0, 8);
    if (photos.length >= 2)
      out.push(
        post(
          root,
          "photos",
          `${root.title} · photos`,
          "gallery",
          photos.map((p) => ({
            type: "image",
            role: "profile",
            path: p.path,
            aspect: p.aspect ?? 2 / 3,
          })),
          "",
        ),
      );
    const relations = (root.data.relations ?? {}) as Record<string, unknown>;
    const known = [...entityIds(relations.knownFor), ...entityIds(relations.filmography)]
      .map(get)
      .filter((t): t is Entity => !!t?.poster)
      .filter((t, i, all) => all.findIndex((x) => x.id === t.id) === i)
      .slice(0, 8);
    if (known.length >= 3)
      out.push(
        post(
          root,
          "knownfor",
          `${root.title} · known for`,
          "gallery",
          known.map((t) => ({
            type: "image",
            role: "poster",
            path: t.poster!,
            aspect: 2 / 3,
            link: t.id,
            label: heading(t),
          })),
          "",
          known.map((t) => t.id),
        ),
      );
    return out;
  }
  const overview = caption(root.overview);
  if (root.poster)
    out.push(
      post(
        root,
        "poster",
        name,
        "image",
        [{ type: "image", role: "poster", path: root.poster, aspect: 2 / 3 }],
        overview,
      ),
    );
  const videos = (Array.isArray(root.data.videos) ? root.data.videos : []) as {
    key?: unknown;
    name?: unknown;
    type?: unknown;
  }[];
  for (const video of videos
    .filter((v) => ["Trailer", "Teaser", "Clip"].includes(fieldText(v.type)))
    .filter((v) => /^[A-Za-z0-9_-]{6,20}$/.test(fieldText(v.key)))
    .slice(0, 4))
    out.push(
      post(
        root,
        `video:${fieldText(video.key)}`,
        fieldText(video.name) || `${root.title} trailer`,
        "video",
        [
          {
            type: "video",
            key: fieldText(video.key),
            name: fieldText(video.name) || "Trailer",
            ...(root.backdrop ? { thumb: root.backdrop } : {}),
          },
        ],
        `${fieldText(video.type) || "Video"} · ${name}`,
      ),
    );
  const backdrops = images(root, "backdrops").slice(0, 8);
  if (backdrops.length >= 2)
    out.push(
      post(
        root,
        "gallery",
        `${root.title} · stills`,
        "gallery",
        backdrops.map((b) => ({
          type: "image",
          role: "backdrop",
          path: b.path,
          aspect: b.aspect ?? 16 / 9,
        })),
        caption(root.data.tagline) || name,
      ),
    );
  const cast = entityIds(root.data.credits)
    .map(get)
    .filter((c): c is Entity => !!c && typeof c.data.character === "string")
    .map((c) => ({ credit: c, person: get(fieldText(c.data.personId)) }))
    .filter((c) => !!c.person?.poster)
    .slice(0, 8);
  if (cast.length >= 3)
    out.push(
      post(
        root,
        "cast",
        `${root.title} · cast`,
        "gallery",
        cast.map(({ credit, person }) => ({
          type: "image",
          role: "profile",
          path: person!.poster!,
          aspect: 2 / 3,
          link: person!.id,
          label: credit.title ? `${person!.title} as ${credit.title}` : person!.title,
        })),
        `Meet the cast of ${root.title}`,
        cast.map(({ person }) => person!.id),
      ),
    );
  const posters = images(root, "posters").slice(0, 8);
  if (posters.length >= 3)
    out.push(
      post(
        root,
        "posters",
        `${root.title} · posters`,
        "gallery",
        posters.map((p) => ({
          type: "image",
          role: "poster",
          path: p.path,
          aspect: p.aspect ?? 2 / 3,
        })),
        name,
      ),
    );
  if (root.backdrop)
    out.push(
      post(
        root,
        "backdrop",
        name,
        "image",
        [{ type: "image", role: "backdrop", path: root.backdrop, aspect: 16 / 9 }],
        caption(root.data.tagline) || overview,
      ),
    );
  for (const season of entityIds(root.data.seasons)
    .map(get)
    .filter((s): s is Entity => !!s?.poster)
    .slice(0, 6)) {
    const number = Number(season.data.seasonNumber ?? season.id.split(":").pop());
    out.push(
      post(
        root,
        `season:${number}`,
        `${root.title} · ${season.title}`,
        "image",
        [{ type: "image", role: "poster", path: season.poster!, aspect: 2 / 3 }],
        caption(season.overview) || season.title,
      ),
    );
  }
  return out;
}

const score = (seed: string) => {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return h >>> 0;
};
// The one or two posts a feed shows for an account. Rich formats lead when details are
// cached; the lead artwork follows so every account still appears from a provider summary.
export function featuredPosts(posts: Entity[], seed: string, limit = 2): Entity[] {
  if (posts.length <= limit) return posts;
  const rich = posts.filter((p) => {
    const format = (p.data as PostData).format;
    return format === "video" || format === "gallery";
  });
  const plain = posts.filter((p) => !rich.includes(p));
  const rotate = (list: Entity[]) => {
    if (!list.length) return list;
    const start = score(seed + (list[0]?.id ?? "")) % list.length;
    return [...list.slice(start), ...list.slice(0, start)];
  };
  return [...rotate(rich).slice(0, 1), ...rotate(plain)].slice(0, limit);
}
// Stable interleaving of member posts into a catalog feed.
export function interleave(primary: string[], secondary: string[], every = 4): string[] {
  const out: string[] = [];
  let j = 0;
  primary.forEach((id, i) => {
    out.push(id);
    if ((i + 1) % every === 0 && j < secondary.length) out.push(secondary[j++]!);
  });
  while (j < secondary.length) out.push(secondary[j++]!);
  return [...new Set(out)];
}
