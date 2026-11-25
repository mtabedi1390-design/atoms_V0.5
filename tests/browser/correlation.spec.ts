import { expect, test, type Page } from "@playwright/test";

const errors: string[] = [];

test.beforeEach(({ page }) => {
  errors.length = 0;
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`console: ${m.text()}`);
  });
});

async function bootLab(page: Page) {
  await page.goto("/");
  await expect(page.getByTestId("viewport")).toBeVisible();
  await expect(page.getByTestId("ws-electron-correlation")).toBeVisible({ timeout: 10000 });
}

test("Electron Correlation workspace enforces guardrails, preflight bounds, computes live He RMP2/RCISD/FCI with matched comparison, and replays from IndexedDB", async ({
  page,
}) => {
  await bootLab(page);
  await page.getByTestId("ws-electron-correlation").click();

  await expect(page.getByTestId("corr-engine-badge")).toContainText("Live Correlation Active", {
    timeout: 15000,
  });

  // 1. AtomSphAverageRHF must always be disabled for post-HF correlation
  await expect(page.getByTestId("corr-ref-atom-sph-avg")).toBeDisabled();

  // 2. ROHF must disable RCISD & UCISD (no spin-restricted ROCISD in PySCF)
  await page.getByTestId("corr-preset-li-ccpvdz-romp2").click();
  await expect(page.getByTestId("corr-method-rcisd")).toBeDisabled();
  await expect(page.getByTestId("corr-method-ucisd")).toBeDisabled();
  await expect(page.getByTestId("corr-method-romp2")).toBeEnabled();
  await expect(page.getByTestId("corr-method-fci")).toBeEnabled();

  // 3. Ne (Z=10) cc-pVDZ Full CI must be blocked pre-allocation with exact N_det = 4,008,004
  await page.getByTestId("corr-preset-ne-ccpvdz-rmp2").click();
  await page.getByTestId("corr-method-fci").click();
  await expect(page.getByTestId("corr-preflight-limit-error")).toContainText("4,008,004");
  await expect(page.getByTestId("corr-run-btn")).toBeDisabled();

  // 4. Compute live He (cc-pVDZ) across RMP2, RCISD, and FCI -> matched comparison table
  await page.getByTestId("corr-preset-he-ccpvdz-rmp2").click();
  await expect(page.getByTestId("corr-preflight-status")).toContainText("Within Preflight Bounds");
  await expect(page.getByTestId("corr-run-btn")).toBeEnabled();

  // Run RMP2
  await page.getByTestId("corr-run-btn").click();
  await expect(page.getByTestId("corr-ecorr-val")).toContainText("-0.02582834", { timeout: 25000 });
  await expect(page.getByTestId("corr-ehf-val")).toContainText("-2.85516048");
  await expect(page.getByTestId("corr-etotal-val")).toContainText("-2.88098882");

  // Run RCISD
  await page.getByTestId("corr-method-rcisd").click();
  await page.getByTestId("corr-run-btn").click();
  await expect(page.getByTestId("corr-ecorr-val")).toContainText("-0.03243435", { timeout: 25000 });

  // Run FCI
  await page.getByTestId("corr-method-fci").click();
  await page.getByTestId("corr-run-btn").click();
  await expect(page.getByTestId("corr-fci-roots-table")).toBeVisible({ timeout: 25000 });

  // Verify Matched Cross-Method Comparison table displays RMP2, RCISD, and FCI on matching key
  const table = page.getByTestId("corr-comparison-table");
  await expect(table).toContainText(/rmp2/i);
  await expect(table).toContainText(/rcisd/i);
  await expect(table).toContainText(/fci/i);
  await expect(table).toContainText("+0.0000");

  // 5. Verify IndexedDB persistence across full reload & Experiment History replay
  await page.reload();
  await expect(page.getByTestId("ws-experiment-history")).toBeVisible({ timeout: 10000 });
  await page.getByTestId("ws-experiment-history").click();
  await expect(page.getByTestId("saved-experiment-card").first()).toContainText("cc-pvdz");
  await page.getByRole("button", { name: "Load / Replay" }).first().click();
  await expect(page.getByText("source: loaded-from-store")).toBeVisible();

  expect(errors).toEqual([]);
});

test("Electron Correlation workspace reports offline / non-JSON backend honestly without fabricating numbers", async ({
  page,
}) => {
  await page.route("**/api/correlation/capabilities*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/html",
      body: "<!doctype html><html><body>Static preview</body></html>",
    }),
  );

  await bootLab(page);
  await page.getByTestId("ws-electron-correlation").click();

  await expect(page.getByTestId("corr-engine-badge")).toContainText("Offline", { timeout: 10000 });
  await expect(page.getByTestId("corr-offline-banner")).toBeVisible();
  await expect(page.getByTestId("corr-run-btn")).toBeDisabled();
  await expect(page.getByTestId("corr-empty-state")).toBeVisible();

  expect(errors).toEqual([]);
});

test("Electron Correlation workspace adapts cleanly on mobile viewport (375x812)", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await bootLab(page);
  await page.getByTestId("ws-electron-correlation").click();

  await expect(page.getByTestId("corr-engine-badge")).toBeVisible({ timeout: 15000 });
  await expect(page.getByTestId("corr-preflight-panel")).toBeVisible();
  await expect(page.getByTestId("corr-run-btn")).toBeVisible();

  expect(errors).toEqual([]);
});
