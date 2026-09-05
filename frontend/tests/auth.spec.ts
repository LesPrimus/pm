import { expect, test } from "@playwright/test";

const signIn = async (page: import("@playwright/test").Page) => {
  await page.getByLabel("Username").fill("user");
  await page.getByLabel("Password").fill("password");
  await page.getByRole("button", { name: /sign in/i }).click();
};

test("requires a sign in before showing the board", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible();
  await expect(page.locator('[data-testid^="column-"]')).toHaveCount(0);
});

test("signs in with the demo credentials", async ({ page }) => {
  await page.goto("/");
  await signIn(page);
  await expect(page.locator('[data-testid^="column-"]')).toHaveCount(5);
  await expect(page.getByTestId("signed-in-user")).toHaveText("user");
});

test("rejects bad credentials without revealing the field", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Username").fill("user");
  await page.getByLabel("Password").fill("wrong");
  await page.getByRole("button", { name: /sign in/i }).click();
  // Scoped by test id: NextJS renders its own role="alert" route announcer.
  await expect(page.getByTestId("login-error")).toHaveText(
    "Invalid username or password."
  );
  await expect(page.locator('[data-testid^="column-"]')).toHaveCount(0);
});

test("keeps the session across a reload", async ({ page }) => {
  await page.goto("/");
  await signIn(page);
  await expect(page.locator('[data-testid^="column-"]')).toHaveCount(5);

  await page.reload();
  await expect(page.locator('[data-testid^="column-"]')).toHaveCount(5);
  await expect(page.getByTestId("signed-in-user")).toHaveText("user");
});

test("logs out and stays logged out after a reload", async ({ page }) => {
  await page.goto("/");
  await signIn(page);
  await page.getByRole("button", { name: /log out/i }).click();
  await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible();

  await page.reload();
  await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible();
  await expect(page.locator('[data-testid^="column-"]')).toHaveCount(0);
});
