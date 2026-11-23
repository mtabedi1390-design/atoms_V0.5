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
  await expect(page.locator("header.h-12")).toContainText("Hydrogen");
}

test("Atomic Terms & CI workspace enumerates Russell–Saunders terms, runs live Fixed-Orbital LS-CI on Carbon ³P, validates (L², S², FCI), and replays in Experiment History", async ({
  page,
}) => {
  await bootLab(page);
  await page.getByTestId("ws-atomic-terms").click();

  await expect(page.getByTestId("ls-backend-status")).toContainText("Active", { timeout: 15000 });
  await expect(page.getByText("METHOD: FIXED-ORBITAL LS-COUPLED CI")).toBeVisible();
  await expect(page.getByText(/NOT performed/i)).toBeVisible();

  // Select Nitrogen preset -> verifies odd-parity ⁴S°, ²D°, ²P° term enumeration
  await page.getByTestId("ls-preset-n-2p3").click();
  await expect(page.getByTestId("ls-term-row-4So")).toBeVisible();
  await expect(page.getByTestId("ls-term-row-2Do")).toBeVisible();
  await expect(page.getByTestId("ls-term-row-2Po")).toBeVisible();

  // Verify N=1 Hydrogen is honestly gated as unsupported
  await page.getByTestId("ls-z-select").selectOption("1");
  await expect(page.getByTestId("ls-unsupported-banner")).toContainText("N >= 2");
  await expect(page.getByTestId("ls-run-btn")).toBeDisabled();

  // Select Carbon 2p² preset, pick ³P, run Fixed-Orbital LS-CI (valence-cas)
  await page.getByTestId("ls-preset-c-2p2").click();
  await expect(page.getByTestId("ls-term-row-3P")).toBeVisible();
  await expect(page.getByTestId("ls-term-row-1D")).toBeVisible();
  await expect(page.getByTestId("ls-term-row-1S")).toBeVisible();
  await page.getByTestId("ls-term-row-3P").click();

  await page.getByTestId("ls-activespace-select").selectOption("valence-cas");
  await page.getByTestId("ls-run-btn").click();

  await expect(page.getByTestId("ls-method-badge")).toContainText("Fixed-Orbital LS-CI", { timeout: 30000 });
  await expect(page.getByTestId("ls-e0")).toContainText("-37.67", { timeout: 5000 });
  await expect(page.getByTestId("ls-roots-table")).toContainText("pure-ls-eigenstate");
  await expect(page.getByTestId("ls-fci-crosscheck")).toContainText("Matched PySCF determinant FCI");

  // Verify persistence & replay distinction in Experiment History
  await page.getByTestId("ws-experiment-history").click();
  await expect(page.getByTestId("saved-experiment-card").first()).toContainText("LS-CI/cc-pvdz");
  await page.getByRole("button", { name: "Load / Replay" }).first().click();
  await expect(page.getByText("source: loaded-from-store")).toBeVisible();

  expect(errors).toEqual([]);
});

test("Atomic Terms & CI reports offline / HTML fallback honestly without fabricating energies", async ({ page }) => {
  await page.route("**/api/ls/capabilities", (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/html",
      body: "<!doctype html><html><body>Static fallback HTML</body></html>",
    }),
  );

  await bootLab(page);
  await page.getByTestId("ws-atomic-terms").click();

  await expect(page.getByTestId("ls-backend-status")).toContainText("Offline / Unavailable");
  await expect(page.getByTestId("ls-run-btn")).toBeDisabled();
  expect(errors).toEqual([]);
});
