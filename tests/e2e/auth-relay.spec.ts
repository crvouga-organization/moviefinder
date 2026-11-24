import { expect, test } from "@playwright/test";
import { completeGoogleSignIn, setTestUsername } from "../fixtures/google-browser";

test("both domains complete sign-in, return to the page and isolate sign-out", async ({
  page,
  context,
}) => {
  const suffix = crypto.randomUUID().slice(0, 8);
  const signedIn = (p: typeof page) =>
    expect(p.getByRole("button", { name: "Edit profile" })).toBeVisible();
  await page.goto("/me");
  await completeGoogleSignIn(page, {
    name: "Primary Member",
    email: `primary_${suffix}@example.test`,
  });
  await setTestUsername(page, "Primary Member", `primary_${suffix}`);
  await expect(page).toHaveURL(/^http:\/\/127\.0\.0\.1:5188\/account\/user/);
  await signedIn(page);
  const alias = await context.newPage();
  // Each host keeps its own session cookies: the alias starts signed out.
  await alias.goto("http://localhost:5188/me");
  const google = alias.getByRole("button", { name: "Sign in with Google", exact: true });
  await expect(google).toBeEnabled();
  // The mock provider retains its own SSO session across the two application hosts.
  await google.click();
  await alias.waitForURL(/^http:\/\/localhost:5188\/account\//);
  await setTestUsername(alias, "Alias Member", `alias_${suffix}`);
  await alias.goto("http://localhost:5188/me");
  await signedIn(alias);
  expect(
    (
      await alias.request.post("http://localhost:5188/api/auth/sign-out", {
        headers: { Origin: "http://localhost:5188" },
        data: {},
      })
    ).status(),
  ).toBe(200);
  await alias.close();
  const signedOut = await context.newPage();
  await signedOut.goto("http://localhost:5188/me");
  await expect(signedOut.getByRole("button", { name: "Sign in with Google" })).toBeVisible();
  await page.goto("/me");
  await signedIn(page);
  await signedOut.close();
});

test("shows only the official Google sign-in button with accessible keyboard focus", async ({
  page,
}) => {
  await page.goto("/auth");
  const google = page.getByRole("button", { name: "Sign in with Google", exact: true });
  await expect(google).toBeEnabled();
  await expect(page.locator("input, form")).toHaveCount(0);
  await expect(page.getByText(/password|register|forgot your/i)).toHaveCount(0);
  const image = google.locator("img");
  await expect(image).toHaveAttribute("src", "/brand/google-signin-light.png");
  await expect
    .poll(() =>
      image.evaluate(
        (img: HTMLImageElement) =>
          img.complete && img.naturalWidth === 720 && img.naturalHeight === 160,
      ),
    )
    .toBe(true);
  const box = await image.boundingBox();
  expect(box!.width / box!.height).toBeCloseTo(4.5);
  expect(box!.height).toBeGreaterThanOrEqual(44);
  await google.focus();
  await expect(google).toBeFocused();
  expect(await google.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe("solid");
  expect(await page.locator("body").evaluate((el) => el.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});

test("preserves the return destination and reports sign-in failures", async ({ page }) => {
  let requested: Record<string, unknown> | undefined;
  await page.route("**/api/auth/sign-in/social", (route) => {
    requested = route.request().postDataJSON();
    return route.fulfill({ status: 503, json: { message: "Unavailable" } });
  });
  await page.goto("/auth?returnTo=%2Fexplore%3Ftopic%3Dmovie");
  const google = page.getByRole("button", { name: "Sign in with Google", exact: true });
  await google.click();
  await expect(page.getByRole("status")).toContainText("Google sign-in is unavailable");
  await expect(google).toBeEnabled();
  expect(requested).toMatchObject({ provider: "auth-relay", callbackURL: "/explore?topic=movie" });
  const errorURL = new URL(String(requested?.errorCallbackURL));
  expect(errorURL.pathname).toBe("/auth");
  expect(errorURL.searchParams.get("returnTo")).toBe("/explore?topic=movie");
});

test("handles cancelled Google consent through Mockingbird without a password fallback", async ({
  page,
}) => {
  await page.goto("/auth");
  await page.getByRole("button", { name: "Sign in with Google" }).click();
  await expect(page.getByTestId("oauth-mock-chooser")).toBeVisible();
  await page.getByTestId("oauth-mock-deny").click();
  await expect(page.getByRole("status")).toContainText("We couldn’t complete your sign-in");
  await expect(page.getByRole("button", { name: "Sign in with Google" })).toBeEnabled();
  await expect(page.locator("input")).toHaveCount(0);
});

test("restores the sign-in button when browser Back restores the cached document", async ({
  page,
}) => {
  // Keep the successful pre-redirect document here to exercise the state retained by bfcache.
  await page.route("**/api/auth/sign-in/social", (route) =>
    route.fulfill({ json: { url: "https://relay.example/authorize", redirect: false } }),
  );
  await page.goto("/auth");
  const google = page.getByRole("button", { name: "Sign in with Google", exact: true });
  await google.click();
  await expect(google).toBeDisabled();
  await page.evaluate(() =>
    window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true })),
  );
  await expect(google).toBeEnabled();
  await expect(page.getByRole("status")).not.toContainText("Opening Google");
});

test("callback errors keep provider details out of the interface", async ({ page }) => {
  await page.goto(
    "/auth?socialError=1&error=unable_to_link_account&error_description=fixture-provider-detail",
  );
  await expect(page.getByRole("status")).toContainText("We couldn’t complete your sign-in");
  await expect(page.getByRole("status")).not.toContainText("fixture-provider-detail");
  await expect(page.locator("input")).toHaveCount(0);
});
