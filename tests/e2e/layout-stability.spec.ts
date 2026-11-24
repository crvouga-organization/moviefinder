import { expect, test, type Page } from "@playwright/test";
import { stubArtwork } from "../fixtures/artwork";

// Any layout shift counts, including tiny ones and those right after input.
async function recordShifts(page: Page) {
  await page.addInitScript(() => {
    const shifts: { value: number; nodes: string[] }[] = [];
    (window as unknown as { __shifts: typeof shifts }).__shifts = shifts;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const shift = entry as PerformanceEntry & {
          value: number;
          sources: { node?: Node }[];
        };
        shifts.push({
          value: shift.value,
          nodes: shift.sources.map((s) =>
            s.node instanceof Element ? s.node.outerHTML.slice(0, 160) : String(s.node?.nodeName),
          ),
        });
      }
    }).observe({ type: "layout-shift" });
  });
}
const shifts = (page: Page) =>
  page.evaluate(() => (window as unknown as { __shifts: unknown[] }).__shifts);
const delay = (page: Page, pattern: string, ms: number) =>
  page.route(pattern, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, ms));
    await route.continue().catch(() => {});
  });

test.beforeEach(async ({ page }) => {
  await stubArtwork(page);
  await recordShifts(page);
});
test("the feed reserves its frame while posts and counters arrive", async ({ page }) => {
  await delay(page, "**/api/feed*", 800);
  await page.goto("/");
  await expect(page.locator(".swiper-slide-active article")).toBeVisible();
  await page.waitForTimeout(500);
  await page.getByRole("region", { name: "For You feed" }).focus();
  await page.keyboard.press("ArrowDown");
  await page.waitForTimeout(800);
  expect(await shifts(page)).toEqual([]);
});
test("profiles keep header, stats and tabs anchored as the account hydrates", async ({ page }) => {
  await delay(page, "**/api/accounts/*", 800);
  await page.goto("/account/tmdb%3Amovie%3A550");
  await expect(page.getByRole("heading", { name: "Fight Club", level: 1 })).toBeVisible();
  await page.waitForTimeout(600);
  expect(await shifts(page)).toEqual([]);
});
test("explore keeps its grid anchored while pages load", async ({ page }) => {
  await delay(page, "**/api/feed*", 800);
  await page.goto("/explore");
  await expect(page.getByRole("link", { name: "Open post" }).first()).toBeVisible();
  await page.waitForTimeout(600);
  expect(await shifts(page)).toEqual([]);
});
