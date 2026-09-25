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
  expect((await memberApi.delete(`/api/projects/${workspace.projectId}`)).status()).toBe(403);

  // Members still see what they need to run work.
  expect((await memberApi.get("/api/clankers")).status()).toBe(200);
  expect((await memberApi.get("/api/integrations")).status()).toBe(200);

  // The same requests are open to an admin.
  expect((await adminApi.get("/api/secrets")).status()).toBe(200);
});

test("workspace plumbing sits under Settings → Advanced, for admins only", async ({
  adminPage,
  memberPage,
}) => {
  const plumbing = ["Agents & runners", "Connections", "Secrets", "Prompt templates"];

  // The main navigation has no plumbing for anyone; Settings leads to it.
  await memberPage.goto("/");
  await expect(memberPage.getByRole("link", { name: "Pulse" })).toBeVisible();
  await memberPage.getByRole("link", { name: "Settings", exact: true }).click();
  await expect(memberPage).toHaveURL(/\/settings\/api-tokens$/);
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
