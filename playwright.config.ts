import { existsSync } from "node:fs";
import { defineConfig } from "@playwright/test";

const preinstalledShell = "/ms-playwright/chrome-headless-shell-linux64/chrome-headless-shell";

export default defineConfig({
  testDir: "./tests/browser",
  timeout: 90_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:4173",
    viewport: { width: 1440, height: 900 },
    launchOptions: {
      ...(existsSync(preinstalledShell) && !process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
        ? { executablePath: preinstalledShell }
        : process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
          ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
          : {}),
      args: [
        // Software rendering: CI has no GPU. FPS numbers from this configuration are
        // NOT evidence of hardware performance (see docs/BENCHMARK.md).
        "--use-gl=angle",
        "--use-angle=swiftshader",
        "--enable-unsafe-swiftshader",
        "--ignore-gpu-blocklist",
      ],
    },
  },
  webServer: {
    command: "NODE_ENV=production PORT=4173 node server.ts",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
