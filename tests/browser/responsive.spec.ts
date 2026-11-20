import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 390, height: 844 } });

test("mobile layout opens control and analysis drawers without page-level overflow", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("viewport")).toBeVisible();
  const overflow0 = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow0).toBeLessThanOrEqual(1);
  await page.getByRole("button", { name: "Controls" }).click();
  await expect(page.getByPlaceholder("Search symbol / name / Z")).toBeVisible();
  await page.fill('input[placeholder^="Search"]', "O");
  await expect(page.locator("header.h-12")).toContainText("Oxygen");
  const overflow1 = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow1).toBeLessThanOrEqual(1);
  await page.getByRole("button", { name: "Analysis" }).click();
  await expect(page.getByText("Radial probability distribution")).toBeVisible();
  await page.getByRole("button", { name: /INSPECTOR|Inspector/i }).click();
  await expect(page.getByText(/Known limitations/)).toBeVisible();
});
