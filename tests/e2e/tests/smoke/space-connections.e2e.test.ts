import { expect, test } from "../../playwright/smokeFixtures";

test("a space's connections page lists the connection linked to it", async ({ adminPage, workspace }) => {
  await adminPage.goto(`/spaces/${workspace.projectSlug}/settings/connections`);
  // The seeded GitHub connection is linked to the space, so it offers Unlink.
  await expect(adminPage.getByRole("button", { name: "Unlink" })).toHaveCount(1);
  await expect(adminPage.getByText("Failed to fetch space integrations")).toHaveCount(0);
});
