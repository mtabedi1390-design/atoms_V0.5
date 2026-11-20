import { expect, test } from "@playwright/test";

test("full-atom mode defaults to validated Lobato 2026 Dirac-Fock density across light, transition, and superheavy Z", async ({ page }) => {
  await page.goto("/?z=6");
  await expect(page.locator("header.h-12")).toContainText("Carbon");
  await page.getByRole("button", { name: /Full-atom density/ }).click();
  await expect(page.locator("header.h-12")).toContainText("Dirac–Fock (Lobato 2026)");
  await expect(page.locator("header.h-12")).toContainText("∫ρ = 6.00");
  await expect(page.getByRole("button", { name: "PySCF HF (offline)" })).toBeEnabled();
  await expect(page.getByText(/Total radial density 4πr²ρ/)).toBeVisible();
  expect(await page.locator('[data-testid="layer-row"]').count()).toBe(3);

  // Superheavy Z = 118 (Oganesson): Dirac-Fock density works while NIST IE & ground term are explicitly unavailable
  await page.goto("/?z=118&mode=atom");
  await expect(page.locator("header.h-12")).toContainText("Oganesson");
  await expect(page.locator("header.h-12")).toContainText("Dirac–Fock (Lobato 2026)");
  await expect(page.locator("header.h-12")).toContainText("∫ρ = 118.0");
  await page.getByRole("button", { name: /INSPECTOR|Inspector/i }).click();
  await expect(page.getByText("1st ionisation energy").locator("..")).toContainText("unavailable");
  await expect(page.getByText("Element × Observable Coverage (Og)")).toBeVisible();
});

test("bundled PySCF HF density is selectable, labelled, and validated in the inspector", async ({ page }) => {
  await page.goto("/?z=10&mode=atom");
  await expect(page.locator("header.h-12")).toContainText("Neon");
  await page.getByRole("button", { name: "PySCF HF (offline)" }).click();
  await expect(page.locator("header.h-12")).toContainText("PySCF HF (bundled)");
  await expect(page.locator("header.h-12")).toContainText("∫ρ = 10.0");
  await page.getByRole("button", { name: /INSPECTOR|Inspector/i }).click();
  await expect(page.getByText("Method selection (observable-dependent)")).toBeVisible();
  await expect(page.getByText(/aug-cc-pVTZ/).first()).toBeVisible();
  await expect(page.getByText(/Lobato 2026 Dirac/).first()).toBeVisible();
  await expect(page.getByText(/10\.0\d+ e \/ 10 e expected/)).toBeVisible();
});

test("elements without an offline HF dataset expose DF coverage and honest HF/GRASP/Datatoms limits", async ({ page }) => {
  await page.goto("/?z=26&mode=atom");
  await expect(page.locator("header.h-12")).toContainText("Iron");
  await expect(page.locator("header.h-12")).toContainText("Dirac–Fock (Lobato 2026)");
  await expect(page.getByRole("button", { name: "PySCF HF (offline)" })).toBeDisabled();
  await page.getByRole("button", { name: /INSPECTOR|Inspector/i }).click();
  await expect(page.getByText(/1 <= N <= 10/).first()).toBeVisible();
  await expect(page.getByText(/GRASP2018 is not installed/)).toBeVisible();
  await expect(page.getByText("Element × Observable Coverage (Fe)")).toBeVisible();
});

test("Slater subshell mode renders configuration-average density with functional visibility and opacity controls", async ({ page }) => {
  await page.goto("/?z=10&mode=atom&source=model");
  await expect(page.locator("header.h-12")).toContainText("Slater estimate");
  await expect(page.locator("header.h-12")).toContainText("∫ρ = 10.000");
  const rows = page.locator('[data-testid="layer-row"]');
  await expect(rows).toHaveCount(3);
  const first = rows.first();
  const cb = first.getByRole("checkbox");
  await expect(cb).toBeChecked();
  await cb.uncheck();
  await expect(cb).not.toBeChecked();
  const op = first.getByRole("slider");
  await op.evaluate((el: HTMLInputElement) => { el.value = "0.4"; el.dispatchEvent(new Event("input", { bubbles: true })); });
  await expect(op).toHaveValue("0.4");
  await cb.check();
  await expect(cb).toBeChecked();
});

test("energy diagram separates model bars, NIST IE, and PySCF total HF energy", async ({ page }) => {
  await page.goto("/?z=6");
  await page.getByRole("button", { name: /Levels/i }).click();
  await expect(page.getByText("1st IE (NIST)")).toBeVisible();
  await expect(page.getByText("11.260 eV")).toBeVisible();
  await expect(page.getByText("Total HF E (PySCF)")).toBeVisible();
  await expect(page.getByText(/-37\.6\d+ Ha/)).toBeVisible();
});

test("probability-current toggle is honest for real basis and m=0", async ({ page }) => {
  await page.goto("/?z=1");
  await page.getByRole("checkbox", { name: /Probability current/ }).check();
  await expect(page.getByText(/vanishes identically for real stationary orbitals/)).toBeVisible();
});

test("WebGL2 fallback is surfaced while analytical panels remain usable", async ({ page }) => {
  await page.addInitScript(() => {
    const orig = HTMLCanvasElement.prototype.getContext;
    // @ts-expect-error test shim
    HTMLCanvasElement.prototype.getContext = function (type: string, ...args: unknown[]) {
      if (type === "webgl2") return null;
      // @ts-expect-error test shim
      return orig.call(this, type, ...args);
    };
  });
  await page.goto("/");
  await expect(page.getByText("WebGL2 renderer unavailable")).toBeVisible();
  await expect(page.getByText("Radial probability distribution")).toBeVisible();
});
