import { expect, test } from "@playwright/test";

test.describe("Home page", () => {
  test("loads dashboard heading, season control, and month tabs", async ({ page }) => {
    await page.goto("/");

    await expect(
      page.getByRole("heading", { name: "Rest Advantage Dashboard" })
    ).toBeVisible();

    await expect(page.getByLabelText("Season")).toBeVisible();
    await expect(page.getByRole("button", { name: /^Oct$/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Dec$/ })).toBeVisible();
  });

  test("previous-day control moves the selected date display backward", async ({ page }) => {
    await page.goto("/");

    const display = page.getByTestId("selected-date-display");
    await expect(display).not.toHaveText("Pick a date", { timeout: 60_000 });

    const before = await display.textContent();
    expect(before).toBeTruthy();

    await page.getByRole("button", { name: "Previous day" }).click();

    const after = await display.textContent();
    expect(after).toBeTruthy();
    expect(after).not.toBe(before);
  });

  test("Christmas 2024 slate shows matchup cards with team abbreviations and fatigue decimals", async ({
    page,
  }) => {
    await page.goto("/");

    await page.getByLabelText("Season").selectOption("2024-25");
    await page.getByRole("button", { name: /^Dec$/ }).click();

    const dec25 = page.getByRole("button", { name: /December 25, 2024/ });
    await expect(dec25).toBeVisible({ timeout: 60_000 });
    await dec25.click();

    await page.waitForResponse(
      (res) =>
        res.url().includes("/api/games/2024-12-25") && res.status() === 200
    );

    const matchupHeading = page.getByText(/\b[A-Z]{3}\s*@\s*[A-Z]{3}\b/).first();
    await expect(matchupHeading).toBeVisible({ timeout: 60_000 });

    await expect(page.locator(".tabular-nums").filter({ hasText: /\d+\.\d/ }).first()).toBeVisible();
  });

  test("previous day from an early season date can reach a day with no games", async ({ page }) => {
    await page.goto("/");

    await page.getByLabelText("Season").selectOption("2024-25");
    await page.getByRole("button", { name: /^Oct$/ }).click();

    await page.waitForResponse(
      (res) =>
        res.url().includes("/api/games/dates") &&
        res.url().includes("month=10") &&
        res.status() === 200
    );

    const firstDayWithGames = page.locator('button[aria-label*="games"]').first();
    await expect(firstDayWithGames).toBeVisible({ timeout: 60_000 });
    await firstDayWithGames.click();

    await page.waitForResponse(
      (res) => res.url().includes("/api/games/20") && res.status() === 200
    );

    const prev = page.getByRole("button", { name: "Previous day" });
    for (let i = 0; i < 45; i++) {
      await prev.click();
      const empty = page.getByText("No games scheduled");
      if (await empty.isVisible()) {
        await expect(empty).toBeVisible();
        return;
      }
    }

    throw new Error("Expected to reach a date with no games within 45 previous-day steps");
  });
});
