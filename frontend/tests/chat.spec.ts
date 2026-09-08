import { expect, test, type Page } from "@playwright/test";

const signIn = async (page: Page) => {
  await page.getByLabel("Username").fill("user");
  await page.getByLabel("Password").fill("password");
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page.getByTestId("signed-in-user")).toBeVisible();
};

/** The board as stored, with card-6 moved from Review to Done. */
const movedBoard = async (page: Page) => {
  const board = await page.evaluate(() =>
    fetch("/api/board", { credentials: "include" }).then((r) => r.json())
  );
  for (const column of board.columns) {
    if (column.id === "col-review") column.cardIds = [];
    if (column.id === "col-done") column.cardIds = [...column.cardIds, "card-6"];
  }
  return board;
};

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await signIn(page);
});

// The AI itself is mocked, so the run is deterministic and costs nothing. The
// real call is covered by the manual live check.
const mockChat = async (page: Page, body: unknown) => {
  await page.route("**/api/chat", async (route) => {
    await route.fulfill({ json: body });
  });
};

test("answers a question without touching the board", async ({ page }) => {
  await mockChat(page, {
    reply: "There are two cards in Backlog.",
    board_updated: false,
    board: await movedBoard(page),
  });

  await page.getByTestId("chat-toggle").click();
  await page.getByLabel("Message the assistant").fill("How many in Backlog?");
  await page.getByRole("button", { name: /send/i }).click();

  await expect(page.getByText("There are two cards in Backlog.")).toBeVisible();
  // board_updated was false, so the board in the reply is ignored.
  await expect(page.getByTestId("card-card-6")).toBeVisible();
  await expect(
    page.getByTestId("column-col-review").getByTestId("card-card-6")
  ).toBeVisible();
});

test("applies a board the AI changed, with no manual reload", async ({ page }) => {
  await mockChat(page, {
    reply: "Moved the QA card to Done.",
    board_updated: true,
    board: await movedBoard(page),
  });

  await page.getByTestId("chat-toggle").click();
  await page.getByLabel("Message the assistant").fill("Move the QA card to Done");
  await page.getByRole("button", { name: /send/i }).click();

  await expect(page.getByText("Moved the QA card to Done.")).toBeVisible();
  await expect(page.getByTestId("chat-board-updated")).toBeVisible();
  await expect(
    page.getByTestId("column-col-done").getByTestId("card-card-6")
  ).toBeVisible();
});

test("collapses and expands, leaving the board usable", async ({ page }) => {
  await expect(page.getByTestId("chat-panel")).toBeHidden();

  await page.getByTestId("chat-toggle").click();
  await expect(page.getByTestId("chat-panel")).toBeVisible();
  // The board is beside the sidebar, not behind it.
  await expect(page.getByTestId("column-col-backlog")).toBeVisible();

  await page.getByTestId("chat-toggle").click();
  await expect(page.getByTestId("chat-panel")).toBeHidden();
});
