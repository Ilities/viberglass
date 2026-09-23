import { LateDatabaseScenario } from "../../playwright/lateDatabaseScenario";
import { expect, test } from "../../playwright/smokeFixtures";

test("a backend that starts before its database recovers once the database is up", async () => {
  const scenario = new LateDatabaseScenario();
  try {
    scenario.startBackend();
    // Give it time to try, and fail, to reach the missing database.
    await new Promise((resolve) => setTimeout(resolve, 8_000));
    expect(await scenario.isServing()).toBe(false);

    scenario.startDatabase();
    await expect.poll(() => scenario.isServing(), { timeout: 60_000 }).toBe(true);
  } finally {
    scenario.stop();
  }
});
