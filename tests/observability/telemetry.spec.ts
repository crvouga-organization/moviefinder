import { completeGoogleSignIn, setTestUsername } from "../fixtures/google-browser";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { readRows, bottlenecks, traces } from "../../scripts/telemetry-report";

test("local browsing produces private, correlated browser → API → SQL → worker → provider traces and reports", async ({
  page,
}) => {
  page.on("pageerror", (error) => console.error("Browser failure:", error.name, error.message));
  const directory = process.env.MOVIEFINDER_TELEMETRY_DIR!;
  const suffix = crypto.randomUUID().slice(0, 8);
  const email = `canary_${suffix}@example.test`,
    query = `canary-query-${suffix}`;
  await page.route("https://image.tmdb.org/**", (route) =>
    route.fulfill({
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="30"><rect width="20" height="30" fill="blue"/></svg>',
    }),
  );
  await page.goto("/me");
  await completeGoogleSignIn(page, { name: `canary-name-${suffix}`, email });
  await setTestUsername(page, `canary-name-${suffix}`, `canary_${suffix}`);
  await page.goto("/");
  const slide = page.locator(".swiper-slide-active article").first();
  await expect(slide).toBeVisible({ timeout: 15000 });
  await slide.getByRole("button", { name: "Like", exact: true }).click();
  await expect(slide.getByRole("button", { name: "Unlike", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  // A unique cold account per browser project, reached by an in-app link.
  const cold = `tmdb:person:${parseInt(suffix, 16)}`;
  await page.evaluate(async (id) => {
    const { router } = await import(/* @vite-ignore */ String("/src/client/app.tsx"));
    const a = document.createElement("a");
    a.href = `/account/${encodeURIComponent(id)}`;
    a.textContent = "Open cold person";
    a.id = "trace-destination";
    a.style.cssText =
      "position:fixed;top:200px;right:16px;z-index:2147483647;padding:16px;background:white;color:black";
    a.addEventListener("click", (event) => {
      event.preventDefault();
      void router.navigate({ to: "/account/$id", params: { id } });
    });
    document.body.append(a);
  }, cold);
  let release!: () => void;
  const blocked = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/accounts/*", async (route) => {
    await blocked;
    await route.continue().catch(() => {});
  });
  try {
    await page.locator("#trace-destination").click();
    await expect(page.getByRole("tab", { name: "Credits" })).toBeVisible({ timeout: 1000 });
    await expect
      .poll(() =>
        page.evaluate(() =>
          (
            window as unknown as {
              __moviefinderTelemetry: { events: { kind: string; name: string; path?: string }[] };
            }
          ).__moviefinderTelemetry.events.some(
            (e) => e.kind === "navigation" && e.name === "paint" && e.path === "/account/:id",
          ),
        ),
      )
      .toBe(true);
  } finally {
    release();
  }
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Edward Norton");
  await expect
    .poll(() =>
      page.evaluate(() =>
        (
          window as unknown as {
            __moviefinderTelemetry: { events: { kind: string; name: string }[] };
          }
        ).__moviefinderTelemetry.events.some(
          (event) => event.kind === "content" && event.name === "ready",
        ),
      ),
    )
    .toBe(true);
  await expect
    .poll(() =>
      page.evaluate(() =>
        (
          window as unknown as {
            __moviefinderTelemetry: { events: { kind: string; name: string }[] };
          }
        ).__moviefinderTelemetry.events.some((e) => e.kind === "image" && e.name === "display"),
      ),
    )
    .toBe(true);
  await page.evaluate(async (q) => {
    const { router } = await import(/* @vite-ignore */ String("/src/client/app.tsx"));
    await router.navigate({ to: "/explore", search: { q } });
  }, query);
  await expect(page.getByRole("searchbox", { name: "Search accounts" })).toBeVisible();
  let failOnce = true;
  let samplesDelivered = 0;
  await page.route("**/api/telemetry", async (route) => {
    expect(Buffer.byteLength(route.request().postData()!)).toBeLessThan(49_000);
    if (failOnce) {
      failOnce = false;
      await route.fulfill({ status: 503 });
    } else {
      const batch = JSON.parse(route.request().postData()!) as {
        events: { kind: string; name: string; ms?: number }[];
      };
      samplesDelivered += batch.events.filter(
        (event) => event.kind === "runtime" && event.name === "sample" && event.ms !== undefined,
      ).length;
      await route.continue();
    }
  });
  // Canary data must not survive either browser buffering or the server ingestion boundary.
  await page.evaluate(async (q) => {
    const { track } = await import(/* @vite-ignore */ String("/src/client/telemetry.ts"));
    for (let i = 0; i < 800; i++) track("runtime", "sample", { ms: i });
    track("fetch", `GET /api/profile/${q}`, { ms: 1 });
    track("error", "uncaught", {
      message: q,
      key: q,
      path: `/profile/${q}?q=${q}`,
      sql: `select '${q}' from moviefinder.source_entity`,
      failed: "Error",
    });
  }, query);
  // Automatic collection must catch up after a burst and a failed upload, without a manual flush.
  await expect.poll(() => samplesDelivered, { timeout: 10000 }).toBeGreaterThanOrEqual(800);
  const browserDiagnostics = await page.evaluate(() =>
    JSON.stringify(
      (window as unknown as { __moviefinderTelemetry: unknown }).__moviefinderTelemetry,
    ),
  );
  expect(browserDiagnostics).not.toContain(query);
  const flush = () =>
    page.evaluate(async () => {
      await (
        window as unknown as { __moviefinderTelemetry: { flush: () => Promise<void> } }
      ).__moviefinderTelemetry.flush();
    });
  await flush();
  await flush();
  const events = async () => readRows(await readFile(join(directory, "events.ndjson"), "utf8"));
  await expect
    .poll(
      async () =>
        traces(await events()).filter(
          (trace) => trace.path === "/account/:id" && trace.resolvedMs !== undefined,
        ).length,
    )
    .toBeGreaterThan(0);
  expect(failOnce).toBe(false);
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { __moviefinderTelemetry: { counts: Record<string, number> } })
          .__moviefinderTelemetry.counts["transport.retries"],
    ),
  ).toBeGreaterThan(0);
  const rows = await events();
  // The cold person visit, not the profile redirect after sign-in.
  const detail = traces(rows).findLast(
    (trace) => trace.path === "/account/:id" && trace.kinds.includes("upstream"),
  );
  expect(detail).toBeDefined();
  expect(detail!.resolvedMs).toBeGreaterThan(0);
  expect(Number(detail!.contentMs)).toBeGreaterThan(Number(detail!.paintMs));
  for (const kind of [
    "content",
    "fetch",
    "http",
    "db",
    "db-pool",
    "job-wait",
    "job",
    "upstream",
    "parse",
    "merge",
  ]) {
    expect(detail!.kinds.includes(kind), `detail trace includes ${kind}`).toBe(true);
  }
  const requestId = detail!.stages.find(
    (stage) => stage.kind === "fetch" && stage.name === "GET /api/accounts/:id",
  )?.requestId;
  expect(requestId).toBeDefined();
  const request = rows.find((row) => row.kind === "fetch" && row.requestId === requestId);
  // A route's own read joins its navigation trace directly.
  expect(request?.traceId).toBe(detail!.traceId);
  expect(rows.some((row) => row.kind === "http" && row.requestId === request?.requestId)).toBe(
    true,
  );
  expect(rows.some((row) => row.kind === "db" && row.requestId === request?.requestId)).toBe(true);
  const report = bottlenecks(rows);
  expect(report.coverage).toMatchObject({
    browser: true,
    server: true,
    database: true,
    provider: true,
    navigation: true,
  });
  const raw = await readFile(join(directory, "events.ndjson"), "utf8");
  for (const canary of [email, query, `canary-name-${suffix}`, `canary_${suffix}`])
    expect(raw).not.toContain(canary);
  const cli = await promisify(execFile)("bun", ["scripts/telemetry.ts", "bottlenecks", "--json"], {
    env: { ...process.env, MOVIEFINDER_TELEMETRY_DIR: directory },
  });
  const output = JSON.parse(cli.stdout);
  expect(output.coverage).toMatchObject(report.coverage);
  expect(output.slowestNavigations.length).toBeGreaterThan(0);
});
