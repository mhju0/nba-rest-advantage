import { expect, test } from "@playwright/test";

function toYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

test.describe("Home page", () => {
  test("loads dashboard heading, date control, and navigation context", async ({ page }) => {
    await page.goto("/");

    await expect(
      page.getByRole("heading", { name: "Rest Advantage Dashboard" })
    ).toBeVisible();

    const dateInput = page.locator('input[type="date"]');
    await expect(dateInput).toBeVisible();

    const today = toYmd(new Date());
    await expect(dateInput).toHaveValue(today);
  });

  test("previous-day control moves the date picker to yesterday", async ({ page }) => {
    await page.goto("/");

    const dateInput = page.locator('input[type="date"]');
    const before = await dateInput.inputValue();

    await page.getByRole("button", { name: "Previous day" }).click();

    const after = await dateInput.inputValue();
    const beforeDate = new Date(`${before}T12:00:00`);
    beforeDate.setDate(beforeDate.getDate() - 1);
    expect(after).toBe(toYmd(beforeDate));
  });

  test("Christmas 2024 slate shows matchup cards with team abbreviations and fatigue decimals", async ({
    page,
  }) => {
    await page.goto("/");

    const dateInput = page.locator('input[type="date"]');
    await dateInput.fill("2024-12-25");

    const gamesResponse = page.waitForResponse(
      (res) =>
        res.url().includes("/api/games/2024-12-25") && res.status() === 200
    );
    await gamesResponse;

    const matchupHeading = page.getByText(/\b[A-Z]{3}\s*@\s*[A-Z]{3}\b/).first();
    await expect(matchupHeading).toBeVisible({ timeout: 60_000 });

    await expect(page.locator(".tabular-nums").filter({ hasText: /\d+\.\d/ }).first()).toBeVisible();
  });

  test("off-season date shows empty state", async ({ page }) => {
    await page.goto("/");

    const dateInput = page.locator('input[type="date"]');
    await dateInput.fill("2026-08-01");

    await page.waitForResponse(
      (res) =>
        res.url().includes("/api/games/2026-08-01") && res.status() === 200
    );

    await expect(page.getByText("No games scheduled")).toBeVisible({
      timeout: 60_000,
    });
  });
});
