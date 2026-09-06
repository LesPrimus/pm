import { defineConfig, devices } from "@playwright/test";

// End to end runs against the real deployment shape: the static export built by
// NextJS and served by FastAPI, not the NextJS dev server.
export default defineConfig({
  testDir: "./tests",
  // One account, one board, one database: parallel tests would overwrite each
  // other's board. Serial is a property of the MVP, not a workaround.
  workers: 1,
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  use: {
    baseURL: "http://127.0.0.1:8000",
    trace: "retain-on-failure",
  },
  webServer: {
    // Start from an empty database so a run does not inherit the last one.
    // node rather than rm, so this works on Windows too.
    command:
      "node -e \"require('fs').rmSync('../data/e2e.db',{force:true})\" && npm run build && uv run --directory ../backend uvicorn app.main:app --host 127.0.0.1 --port 8000",
    url: "http://127.0.0.1:8000/api/health",
    // Its own database, so a test run cannot overwrite the board you were using.
    env: { DATABASE_PATH: "../data/e2e.db" },
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
