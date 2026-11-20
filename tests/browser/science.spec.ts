import { expect, test } from "@playwright/test";

test("open-shell full-atom density integrates to the declared electron count", async ({ page }) => {
  await page.goto("/?z=6");
  await expect(page.locator("header.h-12")).toContainText("Carbon");
  await page.getByRole("button", { name: /Full-atom density/ }).click();
  await expect(page.locator("header.h-12")).toContainText("independent-electron density");
  await expect(page.locator("header.h-12")).toContainText("∫ρ = 6.000");
  await expect(page.getByRole("button", { name: "PySCF HF (offline)" })).toBeEnabled();
  expect(await page.locator('[data-testid="layer-row"]').count()).toBe(3);
});

test("bundled PySCF HF density is selectable, labelled, and validated in the inspector", async ({ page }) => {
  await page.goto("/?z=10&mode=atom");
  await expect(page.locator("header.h-12")).toContainText("Neon");
  await page.getByRole("button", { name: "PySCF HF (offline)" }).click();
  await expect(page.locator("header.h-12")).toContainText("PySCF HF (bundled)");
  await expect(page.locator("header.h-12")).toContainText("∫ρ = 10.0");
  await page.getByRole("button", { name: /INSPECTOR|Inspector/i }).click();
  const inspector = page.getByText("Method selection (observable-dependent)");
  await expect(inspector).toBeVisible();
  await expect(page.getByText(/aug-cc-pVTZ/).first()).toBeVisible();
  await expect(page.getByText(/electron count/).first()).toBeVisible();
  await expect(page.getByText(/10\.0\d+ e \/ 10 e expected/)).toBeVisible();
});

test("elements without an offline HF dataset expose the limitation, not fabricated data", async ({ page }) => {
  await page.goto("/?z=26&mode=atom");
  await expect(page.locator("header.h-12")).toContainText("Iron");
  await expect(page.getByRole("button", { name: "PySCF HF (offline)" })).toBeDisabled();
  await page.getByRole("button", { name: /INSPECTOR|Inspector/i }).click();
  await expect(page.getByText(/No HF dataset for Z=26/)).toBeVisible();
  await expect(page.getByText(/GRASP2018 is not installed/)).toBeVisible();
});

test("subshell visibility and opacity are functional state", async ({ page }) => {
  await page.goto("/?z=10&mode=atom");
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
