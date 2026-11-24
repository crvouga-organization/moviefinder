import { expect, test } from "@playwright/test";
import { stubArtwork } from "../fixtures/artwork";

const routes: [string, string][] = [
  ["/", "For You"],
  ["/following", "Following"],
  ["/explore", "Explore"],
  ["/explore?q=Fight", "Explore"],
  ["/account/tmdb%3Amovie%3A550", "Fight Club"],
  ["/account/tmdb%3Atv%3A1399", "Game of Thrones"],
  ["/account/tmdb%3Aperson%3A819", "Edward Norton"],
  [`/post/${encodeURIComponent("tmdb:movie:550~cast")}`, "Post"],
  ["/create", "Create a post"],
  ["/me", "Your profile"],
];
test("small phones and tablets keep every route within the viewport", async ({ page }) => {
  await stubArtwork(page);
  for (const width of [320, 768]) {
    await page.setViewportSize({ width, height: 900 });
    for (const [path, heading] of routes) {
      await page.goto(path);
      await expect(
        page.getByRole("heading", { name: heading, exact: true, level: 1 }),
      ).toBeVisible();
      expect(
        await page.locator("body").evaluate((body) => body.scrollWidth <= innerWidth),
        `${width}px ${path}`,
      ).toBe(true);
    }
  }
});
test("public screens pass automated accessibility checks", async ({ page }) => {
  await stubArtwork(page);
  const { default: AxeBuilder } = await import("@axe-core/playwright");
  for (const [path, heading] of routes) {
    await page.goto(path);
    await expect(page.getByRole("heading", { name: heading, exact: true, level: 1 })).toBeVisible();
    await page.evaluate(() =>
      Promise.all(document.getAnimations().map((a) => a.finished.catch(() => {}))),
    );
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(
      results.violations.map(({ id, nodes }) => ({
        id,
        path,
        targets: nodes.map((n) => n.target),
      })),
    ).toEqual([]);
  }
});
