import { expect, test } from "@playwright/test";

test.describe("Primary navigation", () => {
  test("exposes core routes with an active-state treatment", async ({ page }) => {
    await page.goto("/");

    const games = page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", {
      name: "Today's Games",
    });
    const analysis = page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", {
      name: "Analysis",
    });
    const tracker = page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", {
      name: "Prediction Tracker",
    });

    await expect(games).toBeVisible();
    await expect(analysis).toBeVisible();
    await expect(tracker).toBeVisible();

    await expect(games).toHaveClass(/17408B/);

    await analysis.click();
    await expect(page).toHaveURL(/\/analysis$/);
    await expect(analysis).toHaveClass(/17408B/);

    await tracker.click();
    await expect(page).toHaveURL(/\/tracker$/);
    await expect(tracker).toHaveClass(/17408B/);

    await games.click();
    await expect(page).toHaveURL(/\/$/);
    await expect(games).toHaveClass(/17408B/);
  });
});
