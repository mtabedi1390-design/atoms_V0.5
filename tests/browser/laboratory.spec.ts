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
  await expect(page.locator("header.h-12")).toContainText("worker");
}

test("navigates cleanly across all 8 laboratory workspaces and preserves Workbench WebGL2", async ({ page }) => {
  await bootLab(page);

  const tabIds = [
    "atomic-systems",
    "quantum-states",
    "energy-structure",
    "transitions",
    "spectroscopy",
    "analysis",
    "experiment-history",
    "workbench",
  ] as const;

  for (const id of tabIds) {
    await page.getByTestId(`ws-${id}`).click();
    await expect(page.getByTestId(`ws-${id}`)).toHaveAttribute("aria-selected", "true");
  }

  await expect(page.getByTestId("viewport")).toBeVisible();
  const canvasBox = await page.getByTestId("viewport").boundingBox();
  expect(canvasBox?.width ?? 0).toBeGreaterThan(200);
  expect(errors).toEqual([]);
});

test("Atomic Systems configures He+ ion, distinct nuclear vs atomic mass, and honest unsupported finite-nucleus status", async ({
  page,
}) => {
  await bootLab(page);
  await page.getByTestId("ws-atomic-systems").click();

  await page.getByLabel("Atomic number selector").selectOption("2");
  await page.getByRole("button", { name: "H-like (N=1)" }).click();

  await expect(page.getByText("Z=2, N=1, q=+1 (cation (+1))")).toBeVisible();
  // Distinct bare nuclear mass vs neutral atomic mass for 4He
  await expect(page.getByText("4.001506179 u")).toBeVisible();
  await expect(page.getByText("4.002603254 u")).toBeVisible();

  // Point-finite-mass reduced mass ratio < 1
  await expect(page.getByText(/0\.9998629/)).toBeVisible();

  // Select finite uniform nuclear model -> must show unsupported solver honestly
  await page.getByRole("button", { name: /Finite uniform sphere/ }).click();
  await expect(page.getByText("unsupported solver").first()).toBeVisible();

  // Restore point-finite-mass -> Schrödinger & Dirac providers show supported
  await page.getByRole("button", { name: /Point nucleus \(finite nuclear mass\)/ }).click();
  await expect(page.getByText("supported").first()).toBeVisible();

  expect(errors).toEqual([]);
});

test("Quantum States & Workbench support Dirac 4-spinor and 3D Marching Tetrahedra isosurface in Worker", async ({
  page,
}) => {
  await bootLab(page);
  await page.getByTestId("ws-quantum-states").click();

  await page.getByRole("button", { name: /Relativistic Dirac \(n, κ, j, m_j\)/ }).click();
  await expect(page.getByText("Dirac Spinor Radial Components P(r), Q(r), |P|²+|Q|²")).toBeVisible();

  // Switch back to Workbench and toggle Dirac 4-spinor + 3D Isosurface in ControlRail
  await page.getByTestId("ws-workbench").click();
  await page.getByRole("button", { name: "Dirac 4-spinor" }).click();
  await expect(page.getByText(/P and Q are coupled 4-spinor components/)).toBeVisible();

  await page.getByLabel(/3D Isosurface \(Marching Tetrahedra\)/).click();
  // Wait for off-thread Marching Tetrahedra extraction to complete
  await expect(page.getByText(/triangles extracted in/)).toBeVisible({ timeout: 20000 });

  expect(errors).toEqual([]);
});

test("Transitions workspace evaluates allowed & forbidden E1 transitions and submits Worker experiment", async ({
  page,
}) => {
  await bootLab(page);
  await page.getByTestId("ws-transitions").click();

  // Switch to Nonrelativistic Schrödinger E1 (default is 1s -> 2p, then switch to 2p -> 1s)
  await page.getByRole("button", { name: /Nonrelativistic Schrödinger E1/ }).click();
  await expect(page.getByText("E1 ALLOWED", { exact: true })).toBeVisible();
  await expect(page.getByText(/6\.2649\d*e\+8 s⁻¹/)).toBeVisible();

  // Change to 2s (m=0) -> 1s (m=0) => E1 FORBIDDEN
  await page.getByLabel("NR initial state").selectOption({ label: "2s (m=0)" });
  await page.getByLabel("NR final state").selectOption({ label: "1s (m=0)" });
  await expect(page.getByText("E1 FORBIDDEN", { exact: true })).toBeVisible();

  // Switch to Relativistic Dirac E1 (default 1s_1/2 -> 2p_3/2) and submit experiment
  await page.getByRole("button", { name: /Relativistic Dirac E1/ }).click();
  await expect(page.getByText("DIRAC E1 ALLOWED")).toBeVisible();
  await page.getByTestId("run-transition-exp").click();

  // Navigates to Experiment History and persists result
  await expect(page.getByTestId("ws-experiment-history")).toHaveAttribute("aria-selected", "true");
  await expect(page.getByTestId("saved-experiment-card").first()).toBeVisible({ timeout: 10000 });
  await expect(page.getByText("source: computed")).toBeVisible();
  expect(errors).toEqual([]);
});

test("Spectroscopy workspace computes NIST-matched Balmer/Lyman lines and Analysis workspace renders 2D slice & radial plot", async ({
  page,
}) => {
  await bootLab(page);
  await page.getByTestId("ws-spectroscopy").click();

  await expect(page.getByRole("img", { name: "Calculated atomic stick spectrum" })).toBeVisible();
  await expect(page.getByText(/Balmer-alpha \/ H-alpha/)).toBeVisible();
  await expect(page.getByText(/656\.46/).first()).toBeVisible();

  await page.getByRole("button", { name: "Lyman" }).click();
  await expect(page.getByText(/Lyman-alpha/)).toBeVisible();
  await expect(page.getByText(/121\.56/).first()).toBeVisible();

  await page.getByTestId("run-spec-exp").click();
  await expect(page.getByTestId("saved-experiment-card").first()).toBeVisible({ timeout: 10000 });

  await page.getByTestId("ws-analysis").click();
  await expect(page.getByRole("img", { name: "2D orbital slice heatmap" })).toBeVisible();
  await expect(page.getByRole("img", { name: "Radial probability distribution" })).toBeVisible();
  expect(errors).toEqual([]);
});

test("Experiment History supports IndexedDB replay vs recompute and schema-validated JSON export/import", async ({
  page,
}) => {
  await bootLab(page);
  await page.getByTestId("ws-experiment-history").click();

  await page.getByTestId("history-run-current").click();
  await expect(page.getByTestId("saved-experiment-card").first()).toBeVisible({ timeout: 10000 });
  await expect(page.getByText("source: computed")).toBeVisible();

  // Load / Replay -> distinct source: loaded-from-store
  await page.getByRole("button", { name: "Load / Replay" }).first().click();
  await expect(page.getByText("source: loaded-from-store")).toBeVisible();

  // Rerun Calculation -> fresh recomputation with source: computed and recomputedCount = 1
  await page.getByRole("button", { name: "Rerun Calculation" }).first().click();
  await expect(page.getByText("source: computed")).toBeVisible({ timeout: 10000 });
  await expect(page.getByText(/recomputedCount=1/)).toBeVisible();

  // Export JSON & re-import valid bundle
  await page.getByRole("button", { name: "Export JSON" }).first().click();
  const exportedText = await page.locator("textarea[readonly]").inputValue();
  expect(exportedText).toContain("atoms-experiment-bundle");

  // Reject malformed JSON cleanly
  await page.getByLabel("Import experiment JSON").fill("{ not valid json");
  await page.getByRole("button", { name: "Validate & Import JSON" }).click();
  await expect(page.getByText(/Malformed JSON/)).toBeVisible();

  // Reject unsupported bundle version
  await page
    .getByLabel("Import experiment JSON")
    .fill(JSON.stringify({ format: "atoms-experiment-bundle", bundleVersion: 99, entries: [] }));
  await page.getByRole("button", { name: "Validate & Import JSON" }).click();
  await expect(page.getByText(/Unsupported bundleVersion 99/)).toBeVisible();

  // Accept valid exported JSON bundle
  await page.getByLabel("Import experiment JSON").fill(exportedText);
  await page.getByRole("button", { name: "Validate & Import JSON" }).click();
  await expect(page.getByText(/Imported 1 experiment\(s\)/)).toBeVisible();
  await expect(page.getByTestId("saved-experiment-card")).toHaveCount(2);

  expect(errors).toEqual([]);
});

test("v0.6 workspace navigation has no mobile horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await bootLab(page);

  for (const id of ["atomic-systems", "transitions", "spectroscopy", "experiment-history"] as const) {
    await page.getByTestId(`ws-${id}`).click();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  }
  expect(errors).toEqual([]);
});
