import { defineConfig, devices } from "@playwright/test";
import path from "node:path";
const root = path.resolve(__dirname, "..");
export default defineConfig({
  testDir: "./tests/browser",
  timeout: 45000,
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  outputDir: "test-results",
  use: { baseURL: "http://127.0.0.1:3001", trace: "retain-on-failure" },
  webServer: [
    {
      command: `"${path.join(root, "backend/.venv/Scripts/python.exe")}" "${path.join(root, "scripts/run_test_server.py")}"`,
      url: "http://127.0.0.1:8001/health",
      timeout: 60000,
      reuseExistingServer: false,
      env: {
        VYUMI_GENERATION_MODE: "fixture",
        VYUMI_DATA_DIR: path.join(root, "data", `browser-${Date.now()}`),
        VYUMI_MERCHANT_TOKEN: "browser-test-token",
        VYUMI_WORKER_INTERVAL: "0.1",
        VYUMI_ALLOWED_ORIGINS:
          '["http://127.0.0.1:3001","http://127.0.0.1:8001"]',
      },
    },
    {
      command: "npm run dev -- --port 3001",
      url: "http://127.0.0.1:3001",
      timeout: 60000,
      reuseExistingServer: false,
      env: { BACKEND_URL: "http://127.0.0.1:8001" },
    },
  ],
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 1000 },
      },
    },
  ],
});
