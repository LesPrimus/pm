import { expect, test, type Page } from "@playwright/test";

const signIn = async (page: Page) => {
  await page.getByLabel("Username").fill("user");
  await page.getByLabel("Password").fill("password");
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page.getByTestId("signed-in-user")).toBeVisible();
};

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await signIn(page);
});

test("a new card survives a reload", async ({ page }) => {
  const column = page.getByTestId("column-col-backlog");
  await column.getByRole("button", { name: /add a card/i }).click();
  await column.getByPlaceholder("Card title").fill("Persisted card");
  await column.getByPlaceholder("Details").fill("Written to the database.");
  await column.getByRole("button", { name: /add card/i }).click();
  await expect(column.getByText("Persisted card")).toBeVisible();

  await page.reload();
  await expect(
    page.getByTestId("column-col-backlog").getByText("Persisted card")
  ).toBeVisible();
});

test("a moved card stays moved after a reload", async ({ page }) => {
  const card = page.getByTestId("card-card-2");
  const target = page.getByTestId("column-col-review");
  const cardBox = await card.boundingBox();
  const targetBox = await target.boundingBox();
  if (!cardBox || !targetBox) throw new Error("Unable to resolve drag coordinates.");

  await page.mouse.move(cardBox.x + cardBox.width / 2, cardBox.y + cardBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + 120, {
    steps: 12,
  });
  await page.mouse.up();
  await expect(target.getByTestId("card-card-2")).toBeVisible();

  await page.reload();
  await expect(
    page.getByTestId("column-col-review").getByTestId("card-card-2")
  ).toBeVisible();
});

test("a renamed column keeps its name after a reload", async ({ page }) => {
  const title = page.getByTestId("column-col-discovery").getByLabel("Column title");
  await title.fill("Research");

  await page.reload();
  await expect(
    page.getByTestId("column-col-discovery").getByLabel("Column title")
  ).toHaveValue("Research");
});

test("the board is unchanged after logging out and back in", async ({ page }) => {
  const column = page.getByTestId("column-col-done");
  await column.getByRole("button", { name: /add a card/i }).click();
  await column.getByPlaceholder("Card title").fill("Still here");
  await column.getByRole("button", { name: /add card/i }).click();
  await expect(column.getByText("Still here")).toBeVisible();

  await page.getByRole("button", { name: /log out/i }).click();
  await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible();
  await signIn(page);

  await expect(page.getByTestId("column-col-done").getByText("Still here")).toBeVisible();
});
