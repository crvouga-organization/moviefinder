import { defineConfig } from "vite-plus";
import react from "@vitejs/plugin-react";
const apiTarget = `http://127.0.0.1:${process.env.PORT ?? 8080}`;
// Extra exact origins (for example a tailnet HTTPS proxy) may reach the dev server by name.
const extraHosts = (process.env.MOVIEFINDER_ADDITIONAL_ORIGINS ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean)
  .map((origin) => new URL(origin).hostname);
export default defineConfig({
  fmt: { ignorePatterns: ["SPEC.md", ".super.engineering/config.json"] },
  plugins: [react()],
  server: {
    // A proxy in front of the dev server needs a fixed loopback address to target.
    host: process.env.MOVIEFINDER_DEV_HOST || "localhost",
    allowedHosts: extraHosts,
    port: Number(process.env.MOVIEFINDER_WEB_PORT) || undefined,
    strictPort: Boolean(process.env.MOVIEFINDER_WEB_PORT),
    watch: { ignored: ["**/.local/**"] },
    fs: { deny: [".env", ".env.*", "*.{crt,pem}", "**/.git/**", "**/.local/**"] },
    // Keep the browser's Host so the backend selects the matching configured origin.
    proxy: Object.fromEntries(
      ["/api", "/health"].map((path) => [path, { target: apiTarget, changeOrigin: false }]),
    ),
  },
  build: { outDir: "dist", sourcemap: false },
  lint: {
    options: { typeAware: true, typeCheck: true },
    ignorePatterns: ["dist/**", "node_modules/**"],
    rules: { "no-console": "off" },
  },
  test: {
    projects: [
      { test: { name: "unit", include: ["tests/unit/**/*.test.ts"] } },
      {
        test: {
          name: "local-database",
          include: ["tests/local-database/**/*.test.ts"],
          testTimeout: 30000,
          fileParallelism: false,
        },
      },
      {
        test: {
          name: "integration",
          include: ["tests/integration/**/*.test.ts"],
          testTimeout: 30000,
          hookTimeout: 30000,
          fileParallelism: false,
        },
      },
    ],
  },
});
