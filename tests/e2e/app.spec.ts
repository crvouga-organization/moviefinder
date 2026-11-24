import { expect, test, type Page } from "@playwright/test";
import { completeGoogleSignIn, setTestUsername } from "../fixtures/google-browser";
import { stubArtwork } from "../fixtures/artwork";

const active = (page: Page) => page.locator(".swiper-slide-active article").first();
test.beforeEach(async ({ page }) => {
  await stubArtwork(page);
  page.on("pageerror", (error) => console.error("Browser failure:", error.message));
});

test("visitors scroll, open accounts and search without signing in", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "For You", level: 1 })).toBeVisible();
  await expect(active(page)).toBeVisible();
  const first = await active(page).getByRole("link", { name: "Open post" }).getAttribute("href");
  await page.getByRole("region", { name: "For You feed" }).focus();
  await page.keyboard.press("ArrowDown");
  await expect
    .poll(() => active(page).getByRole("link", { name: "Open post" }).getAttribute("href"))
    .not.toBe(first);
  // Interactions ask for sign-in instead of failing.
  await active(page).getByRole("button", { name: "Like" }).click();
  const dialog = page.getByRole("dialog", { name: "Sign in to MovieFinder" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Sign in with Google" })).toBeVisible();
  await dialog.getByRole("button", { name: "Close" }).click();
  await expect(dialog).toBeHidden();
  // Comments are readable signed out.
  await active(page).getByRole("button", { name: "Comments" }).click();
  await expect(page.getByRole("dialog", { name: "Comments" })).toBeVisible();
  await expect(page.getByText("No comments yet")).toBeVisible();
  await page.keyboard.press("Escape");

  await page.goto("/account/tmdb%3Amovie%3A550");
  await expect(page.getByRole("heading", { name: "Fight Club", level: 1 })).toBeVisible();
  await expect(page.getByRole("button", { name: "Follow Fight Club" })).toBeVisible();
  await page.getByRole("tab", { name: "Cast" }).click();
  await page.getByRole("link", { name: /Brad Pitt/ }).click();
  await expect(page).toHaveURL(/\/account\/tmdb(%3A|:)person(%3A|:)287/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Edward Norton");

  await page.goto("/explore");
  await page.getByRole("searchbox", { name: "Search accounts" }).fill("Fight");
  await expect(page).toHaveURL(/q=Fight/);
  await expect(page.getByRole("link", { name: /Fight Club/ }).first()).toBeVisible();

  await page.goto("/following");
  await expect(page.getByRole("heading", { name: "Your Following feed" })).toBeVisible();
});

test("an account grid plays as a vertical feed from the chosen post", async ({ page }) => {
  await page.goto("/account/tmdb%3Amovie%3A550");
  await page.getByRole("tab", { name: "Videos" }).click();
  await page.getByRole("link", { name: "Open post" }).first().click();
  await expect(page).toHaveURL(/\/watch\?/);
  await expect(active(page).getByRole("button", { name: /^Play / })).toBeVisible();
  await active(page)
    .getByRole("button", { name: /^Play / })
    .click();
  await expect(active(page).locator("iframe")).toHaveAttribute(
    "src",
    /youtube-nocookie\.com\/embed\/test-trailer/,
  );
});

test("members follow, like, comment and post with immediate feedback", async ({ page }) => {
  const suffix = crypto.randomUUID().slice(0, 8);
  await page.goto("/me");
  await completeGoogleSignIn(page, { name: "Feed Member", email: `feed_${suffix}@example.test` });
  await setTestUsername(page, "Feed Member", `feed_${suffix}`);
  await expect(page).toHaveURL(/\/account\/user/);
  await expect(page.getByRole("button", { name: "Edit profile" })).toBeVisible();

  await page.goto("/account/tmdb%3Amovie%3A550");
  const follow = page.getByRole("button", { name: "Follow Fight Club" });
  await follow.click();
  await expect(page.getByRole("button", { name: "Unfollow Fight Club" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.reload();
  await expect(page.getByRole("button", { name: "Unfollow Fight Club" })).toBeVisible();

  await page.goto(`/post/${encodeURIComponent("tmdb:movie:550~poster")}`);
  const like = page.getByRole("button", { name: "Like", exact: true });
  await like.click();
  await expect(page.getByRole("button", { name: "Unlike" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.getByRole("textbox", { name: "Add a comment" }).fill(`Still holds up ${suffix}`);
  await page.getByRole("button", { name: "Post", exact: true }).click();
  await expect(page.getByText(`Still holds up ${suffix}`)).toBeVisible();
  await page.reload();
  await expect(page.getByText(`Still holds up ${suffix}`)).toBeVisible();
  await expect(page.getByRole("button", { name: "Unlike" })).toBeVisible();

  await page.goto("/create");
  await page.getByRole("textbox", { name: "Caption" }).fill(`Movie night ${suffix}`);
  await page.getByRole("textbox", { name: "Tag a movie, show or person" }).fill("Fight");
  await page.getByRole("button", { name: "Tag Fight Club" }).click();
  await page.getByRole("checkbox", { name: "Attach this image" }).first().check();
  await page.getByRole("button", { name: "Share" }).click();
  await expect(page).toHaveURL(/\/account\/user/);
  await expect(page.getByRole("link", { name: "Open post" })).toHaveCount(1);

  await page.goto("/following");
  await expect(active(page).getByText(`Movie night ${suffix}`)).toBeVisible();
});
