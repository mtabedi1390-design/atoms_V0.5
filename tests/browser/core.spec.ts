import { expect, test, type Page } from "@playwright/test";

const errors: string[] = [];
test.beforeEach(({ page }) => {
  errors.length = 0;
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error") errors.push(`console: ${m.text()}`); });
});

async function loaded(page: Page) {
  await page.goto("/");
  await expect(page.getByTestId("viewport")).toBeVisible();
  await expect(page.locator("header.h-12")).toContainText("Hydrogen");
  await expect(page.locator("header.h-12")).toContainText("worker");
}
async function telemetry(page: Page) {
  return page.locator("header.h-12").innerText();
}
async function atomMode(page: Page) {
  await page.getByRole("button", { name: /Full-atom density/ }).click();
}

test("boots with a ground-state default, renders points, and has no runtime errors", async ({ page }) => {
  await loaded(page);
  const t = await telemetry(page);
  expect(t).toContain("1s");
  expect(t).toContain("Z_EFF");
  expect(t).toContain("13.606");
  expect(t).toMatch(/\d+ fps/);
  await expect(page.getByRole("img", { name: "Radial probability distribution" })).toBeVisible();
  const webgl = await page.evaluate(() => !!document.createElement("canvas").getContext("webgl2"));
  expect(webgl).toBe(true);
  expect(errors).toEqual([]);
});

test("118-element search and keyboard navigation change the actual state", async ({ page }) => {
  await loaded(page);
  await page.fill('input[placeholder^="Search"]', "U");
  await expect(page.locator("header.h-12")).toContainText("Uranium");
  await expect(page.locator("header.h-12")).toContainText("Z = 92");
  await page.fill('input[placeholder^="Search"]', "Ne");
  await expect(page.locator("header.h-12")).toContainText("Neon");
  await page.locator('[role="grid"]').focus();
  await page.keyboard.press("ArrowLeft");
  await expect(page.locator("header.h-12")).toContainText("Fluorine");
  await page.keyboard.press("ArrowRight");
  await expect(page.locator("header.h-12")).toContainText("Neon");
  expect(errors).toEqual([]);
});

test("complex basis with negative m updates state and samples", async ({ page }) => {
  await loaded(page);
  await page.getByTestId("n-3").click();
  await page.getByTestId("l-2").click();
  await page.getByTestId("m--2").click();
  await page.getByRole("button", { name: "Complex Y_l^m" }).click();
  const t = await telemetry(page);
  expect(t).toContain("(3,2,-2)");
  await expect(page.locator("header.h-12")).toContainText("worker");
  await expect(page.locator("header.h-12")).toContainText("2 planar");
  expect(errors).toEqual([]);
});

test("all three cross-section planes and offsets are applied without errors", async ({ page }) => {
  await loaded(page);
  for (const label of ["XY (z=c)", "XZ (y=c)", "YZ (x=c)"]) {
    await page.getByRole("button", { name: label }).click();
    await expect(page.getByRole("button", { name: label })).toHaveClass(/bg-zinc-200/);
    const slider = page.locator('label:has-text("Plane position") input[type="range"]');
    await slider.evaluate((el: HTMLInputElement) => {
      el.value = String(Number(el.value) + Number(el.step) * 20);
      el.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await page.waitForTimeout(250);
    const box = await page.getByTestId("viewport").boundingBox();
    expect(box!.width).toBeGreaterThan(300);
  }
  await page.getByRole("button", { name: "Off", exact: true }).click();
  expect(errors).toEqual([]);
});

test("rapid element changes leave the newest selection visible (no stale results)", async ({ page }) => {
  await loaded(page);
  const search = page.locator('input[placeholder^="Search"]');
  for (const q of ["U", "C", "O", "Ne"]) await search.fill(q);
  await expect(page.locator("header.h-12")).toContainText("Neon");
  await expect(page.locator("header.h-12")).toContainText("worker");
  await page.getByRole("button", { name: /Full-atom density/ }).click();
  await expect(page.locator("header.h-12")).toContainText("3 subshells");
  expect(errors).toEqual([]);
});
