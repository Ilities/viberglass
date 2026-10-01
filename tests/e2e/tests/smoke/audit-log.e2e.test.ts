import type { APIRequestContext } from "@playwright/test";
import { E2E } from "../../playwright/e2eEnvironment";
import { expect, test } from "../../playwright/smokeFixtures";

async function memberId(adminApi: APIRequestContext): Promise<string> {
  const { users } = await (await adminApi.get("/api/users")).json();
  return users.find((user: { email: string }) => user.email === E2E.member.email).id;
}

test("admins see who changed what across the workspace; secret values never reach the log; members can't read it", async ({
  adminApi,
  memberApi,
  adminPage: page,
}) => {
  const secret = await adminApi.post("/api/secrets", {
    data: { name: "AUDIT_E2E_TOKEN", secretLocation: "database", secretValue: "super-secret-value" },
  });
  expect(secret.status()).toBe(201);
  const secretId = (await secret.json()).data.id;
  const member = await memberId(adminApi);
  expect((await adminApi.patch(`/api/users/${member}/role`, { data: { role: "viewer" } })).status()).toBe(200);
  expect((await adminApi.patch(`/api/users/${member}/role`, { data: { role: "member" } })).status()).toBe(200);

  const log = await (await adminApi.get("/api/audit-log")).json();
  const actions = log.data.entries.map((entry: { action: string }) => entry.action);
  expect(actions).toEqual(expect.arrayContaining(["secret.created", "member.role_changed"]));
  expect(log.data.entries).toContainEqual(
    expect.objectContaining({ action: "secret.created", targetId: secretId, details: { name: "AUDIT_E2E_TOKEN" }, actor: expect.objectContaining({ name: "E2E Admin" }) }),
  );
  expect(JSON.stringify(log)).not.toContain("super-secret-value");
  expect((await memberApi.get("/api/audit-log")).status()).toBe(403);

  // Under Settings → Advanced, filtered to one area.
  await page.goto("/settings/audit-log");
  await expect(page.getByRole("cell", { name: /E2E Admin changed someone's workspace role/ }).first()).toBeVisible();
  await page.getByRole("combobox", { name: "Area" }).click();
  await page.getByRole("option", { name: "Secrets" }).click();
  await expect(page.getByRole("cell", { name: /E2E Admin added a secret/ })).toBeVisible();
  await expect(page.getByRole("cell", { name: /workspace role/ })).toHaveCount(0);
});
