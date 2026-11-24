import type { Page } from "@playwright/test";
// Browser tests never reach the image CDN; every TMDB artwork request gets a local placeholder.
export async function stubArtwork(page: Page) {
  await page.route("https://image.tmdb.org/**", (route) =>
    route.fulfill({
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="300"><rect width="200" height="300" fill="purple"/></svg>',
    }),
  );
  await page.route("https://www.youtube-nocookie.com/**", (route) =>
    route.fulfill({ contentType: "text/html", body: "<title>Video</title>" }),
  );
}
