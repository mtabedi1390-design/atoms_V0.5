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

test("Hartree–Fock workspace runs live PySCF UHF/RHF, enforces spin/method rules, projects 3D isosurface & 2D slice, and replays in Experiment History", async ({
  page,
}) => {
  await bootLab(page);
  await page.getByTestId("ws-hartree-fock").click();

  // Live Express+PySCF backend detected cleanly
  await expect(page.getByTestId("hf-backend-status")).toContainText("PySCF active", { timeout: 15000 });
  await expect(page.getByTestId("hf-backend-status")).toContainText("PySCF 2.15.1");

  // Select Carbon (Z=6, 2S=2 open shell) -> RHF must be disabled honestly
  await page.getByTestId("hf-select-z").selectOption("6");
  await expect(page.getByTestId("hf-input-2s")).toHaveValue("2");
  await expect(page.getByTestId("hf-method-rhf")).toBeDisabled();

  // Select basis cc-pVDZ and run UHF SCF via Worker -> /api/hf/calculate
  await page.getByTestId("hf-select-basis").selectOption("cc-pvdz");
  await page.getByTestId("hf-method-uhf").click();
  await page.getByTestId("hf-run-btn").click();

  await expect(page.getByTestId("hf-results-panel")).toContainText("Converged", { timeout: 25000 });
  await expect(page.getByTestId("hf-energy-table")).toContainText("-37.6834");
  await expect(page.getByTestId("hf-orbitals-table")).toContainText("alpha");
  await expect(page.getByTestId("hf-orbitals-table")).toContainText("beta");
  await expect(page.getByTestId("hf-scf-table")).toContainText("-37.6834");
  await expect(page.getByTestId("hf-radial-svg")).toBeVisible();
  await expect(page.getByText(/6\.000\d* e/).first()).toBeVisible();

  // Project genuine PySCF 3D volumetric field into Workbench Marching Tetrahedra
  await page.getByTestId("hf-view-3d-btn").click();
  await expect(page.getByTestId("ws-workbench")).toHaveAttribute("aria-selected", "true");
  await expect(page.getByText(/PySCF C UHF\/cc-pvdz/)).toBeVisible();
  await expect(page.getByText(/triangles\)/)).toBeVisible();

  // Inspect PySCF HF 2D cross-section slice inside Analysis workspace
  await page.getByTestId("ws-analysis").click();
  await page.getByRole("button", { name: /PySCF HF/ }).click();
  await expect(page.getByRole("img", { name: "2D orbital slice heatmap" })).toBeVisible();

  // Verify persistence & replay distinction in Experiment History
  await page.getByTestId("ws-experiment-history").click();
  await expect(page.getByTestId("saved-experiment-card").first()).toContainText("C UHF/cc-pvdz");
  await page.getByRole("button", { name: "Load / Replay" }).first().click();
  await expect(page.getByText("source: loaded-from-store")).toBeVisible();

  expect(errors).toEqual([]);
});

test("Hartree–Fock workspace reports backend offline honestly without faking results when endpoint is unavailable", async ({
  page,
}) => {
  await page.route("**/api/hf/capabilities", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({
        available: false,
        blocker: "Mocked offline test: Python PySCF runtime not running.",
      }),
    }),
  );

  await bootLab(page);
  await page.getByTestId("ws-hartree-fock").click();

  await expect(page.getByTestId("hf-backend-status")).toContainText("backend offline");
  await expect(page.getByText("Live Multi-Electron Solver Unavailable")).toBeVisible();
  await expect(page.getByTestId("hf-run-btn")).toBeDisabled();
  expect(errors.filter((e) => !e.includes("503 (Service Unavailable)"))).toEqual([]);
});
