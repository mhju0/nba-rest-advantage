import { expect, test } from "@playwright/test";

test.describe("Analysis page", () => {
  test("renders hero analytics, charts, and breakdown cards", async ({ page }) => {
    await page.goto("/analysis");

    await expect(
      page.getByRole("heading", { name: "Rest Advantage Analysis" })
    ).toBeVisible();

    await page.waitForResponse(
      (res) => res.url().includes("/api/analysis") && res.status() === 200,
      { timeout: 60_000 }
    );

    const hero = page.locator("p.text-7xl").first();
    await expect(hero).toBeVisible();
    await expect(hero).toContainText(/\d/);
    await expect(hero).toContainText("%");

    await expect(
      page.getByText("Win Rate by Rest Advantage Threshold")
    ).toBeVisible();

    await expect(page.getByText("Home Team More Rested")).toBeVisible();
    await expect(page.getByText("Away Team More Rested")).toBeVisible();

    const breakdownPcts = page.locator("div.rounded-3xl p.text-5xl").filter({ hasText: /%/ });
    await expect(breakdownPcts.first()).toBeVisible();

    await expect(page.getByText("Monthly Win Rate Trend")).toBeVisible();
  });
});
