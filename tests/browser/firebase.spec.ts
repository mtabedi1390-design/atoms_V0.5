import { expect, test } from "@playwright/test";

const errors: string[] = [];

test.beforeEach(({ page }) => {
  errors.length = 0;
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`console: ${m.text()}`);
  });
});

test("Firebase Authentication UI & Cloud Sync panel initialize cleanly without console errors", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByTestId("viewport")).toBeVisible();

  // Top nav renders Google Sign-In trigger once Firebase Auth initializes
  const signInBtn = page.getByTestId("firebase-signin-btn");
  await expect(signInBtn).toBeVisible({ timeout: 10000 });
  await expect(signInBtn).toHaveText("Sign in with Google");

  // Experiment History workspace renders Cloud Sync, Preferences & Bookmarks panel honestly
  await page.getByTestId("ws-experiment-history").click();
  await expect(
    page.getByText("Cloud Sync, Researcher Preferences & Atomic Bookmarks (Firebase)"),
  ).toBeVisible();
  await expect(
    page.getByText(/All quantum solvers and IndexedDB persistence work offline/),
  ).toBeVisible();

  expect(errors).toEqual([]);
});
