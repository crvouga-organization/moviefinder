import { describe, expect, it } from "vite-plus/test";
import fc from "fast-check";
import { normalize } from "../../src/server/entity-store/normalize";
import { catalogPosts, featuredPosts, interleave } from "../../src/shared/posts";
import { postId, type PostData } from "../../src/shared/contracts";
import { movieDetail } from "../fixtures/catalog";

const graph = (id: string, payload: unknown) => {
  const entities = normalize(id, payload, 3);
  const byId = new Map(entities.map((e) => [e.id, e]));
  return { root: byId.get(id)!, get: (key: string) => byId.get(key) };
};

describe("catalog posts", () => {
  it("derives heterogeneous posts with stable, valid identities", () => {
    const { root, get } = graph("tmdb:movie:550", movieDetail);
    const posts = catalogPosts(root, get);
    expect(posts.map((p) => p.id)).toEqual([
      "tmdb:movie:550~poster",
      "tmdb:movie:550~video:test-trailer",
      "tmdb:movie:550~gallery",
      "tmdb:movie:550~cast",
      "tmdb:movie:550~posters",
      "tmdb:movie:550~backdrop",
    ]);
    for (const post of posts) {
      expect(postId.safeParse(post.id).success).toBe(true);
      expect((post.data as PostData).author).toBe("tmdb:movie:550");
      expect(post.version).toBe(3);
    }
    const cast = posts.find((p) => p.id.endsWith("~cast"))!.data as PostData;
    expect(cast.format).toBe("gallery");
    expect(cast.subjects).toContain("tmdb:person:287");
    expect(cast.media.every((m) => m.type === "image" && m.link?.startsWith("tmdb:person:"))).toBe(
      true,
    );
    expect(catalogPosts(root, get)).toEqual(posts);
  });
  it("yields artwork posts from a provider summary alone", () => {
    const { root, get } = graph("tmdb:movie:1", { id: 1, title: "A", poster_path: "/a.jpg" });
    expect(catalogPosts(root, get).map((p) => p.id)).toEqual(["tmdb:movie:1~poster"]);
  });
  it("never throws on arbitrary provider documents", () =>
    fc.assert(
      fc.property(fc.jsonValue(), (value) => {
        for (const id of ["tmdb:movie:1", "tmdb:tv:1", "tmdb:person:1"]) {
          const { root, get } = graph(id, value);
          for (const post of catalogPosts(root, get))
            expect(postId.safeParse(post.id).success).toBe(true);
        }
      }),
      { numRuns: 100 },
    ));
  it("features a rich format first and keeps the choice deterministic", () => {
    const { root, get } = graph("tmdb:movie:550", movieDetail);
    const posts = catalogPosts(root, get);
    const featured = featuredPosts(posts, "foryou:tmdb:movie:550");
    expect(featured).toHaveLength(2);
    expect(["video", "gallery"]).toContain((featured[0]!.data as PostData).format);
    expect(featuredPosts(posts, "foryou:tmdb:movie:550")).toEqual(featured);
  });
  it("interleaves member posts without duplicates or reordering", () =>
    fc.assert(
      fc.property(
        fc.uniqueArray(fc.string({ minLength: 1 })),
        fc.uniqueArray(fc.string({ minLength: 1 })),
        fc.integer({ min: 1, max: 6 }),
        (a, b, every) => {
          const out = interleave(a, b, every);
          expect(new Set(out).size).toBe(out.length);
          expect(out.filter((id) => a.includes(id))).toEqual(a);
          expect(new Set(out)).toEqual(new Set([...a, ...b]));
        },
      ),
    ));
});
