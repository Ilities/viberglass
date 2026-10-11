import { expect, test } from "../../playwright/smokeFixtures";

test("a member cannot change workspace plumbing or delete a space", async ({
  memberApi,
  adminApi,
  workspace,
}) => {
  expect((await memberApi.get("/api/secrets")).status()).toBe(403);
  expect(
    (await memberApi.post("/api/clankers", { data: { name: "Not allowed" } })).status(),
  ).toBe(403);
  expect((await memberApi.delete(`/api/spaces/${workspace.projectId}`)).status()).toBe(403);

  // Members still see what they need to run work.
  expect((await memberApi.get("/api/clankers")).status()).toBe(200);
  expect((await memberApi.get("/api/integrations")).status()).toBe(200);

  // The same requests are open to an admin.
  expect((await adminApi.get("/api/secrets")).status()).toBe(200);
});

test("workspace settings are in the sidebar, for admins only", async ({
  adminPage,
  memberPage,
}) => {
  const plumbing = ["Agents", "Connections", "Secrets", "Prompt templates"];

  // Members have no workspace settings; their own settings are in the account menu.
  await memberPage.goto("/");
  await expect(memberPage.getByRole("link", { name: "Home", exact: true })).toBeVisible();
  await expect(memberPage.getByRole("link", { name: "Overview", exact: true })).toBeVisible();
  await expect(memberPage.getByRole("link", { name: "Settings", exact: true })).toHaveCount(0);
  await memberPage.getByRole("button", { name: "Account" }).click();
  await expect(memberPage.getByRole("menuitem", { name: "Workspace settings" })).toHaveCount(0);
  await memberPage.getByRole("menuitem", { name: "Notifications" }).click();
  await expect(memberPage).toHaveURL(/\/settings\/notifications$/);
  for (const label of plumbing) {
    await expect(memberPage.getByRole("link", { name: label, exact: true })).toHaveCount(0);
  }

  await adminPage.goto("/");
  await expect(adminPage.getByRole("link", { name: "Secrets", exact: true })).toHaveCount(0);
  await adminPage.getByRole("link", { name: "Settings", exact: true }).click();
  await expect(adminPage.getByRole("heading", { name: "Advanced" })).toBeVisible();
  for (const label of plumbing) {
    await expect(adminPage.getByRole("link", { name: label, exact: true })).toBeVisible();
  }
});
