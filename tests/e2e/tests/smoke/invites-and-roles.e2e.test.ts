import { request, type APIRequestContext } from "@playwright/test";
import { E2E } from "../../playwright/e2eEnvironment";
import { signIn } from "../../playwright/seedWorkspace";
import { expect, test } from "../../playwright/smokeFixtures";

async function invite(adminApi: APIRequestContext, email: string, role: string): Promise<string> {
  const response = await adminApi.post("/api/invites", { data: { email, role } });
  expect(response.status()).toBe(201);
  const { path } = await response.json();
  return String(path).replace("/invite/", "");
}

async function accept(token: string, name: string, password: string) {
  const api = await request.newContext({ baseURL: E2E.backendUrl });
  const response = await api.post(`/api/account-links/invites/${token}`, { data: { name, password } });
  const accepted = { status: response.status(), body: await response.json() };
  await api.dispose();
  return accepted;
}

test("an admin invites someone with a link, who joins and lands on the home page; the link works once", async ({
  adminPage,
  browser,
}) => {
  await adminPage.goto("/settings/members");
  await adminPage.getByLabel("Email").fill("designer@example.com");
  await adminPage.getByRole("button", { name: "Create invite link" }).click();
  const link = (await adminPage.getByTestId("one-time-link").textContent())?.trim() ?? "";
  expect(link).toContain("/invite/");
  await expect(adminPage.getByRole("cell", { name: "designer@example.com" })).toBeVisible();

  const invitee = await browser.newContext();
  const page = await invitee.newPage();
  await page.goto(link);
  await expect(page.getByText("E2E Admin invited you")).toBeVisible();
  await page.getByLabel("Your name").fill("Dana Designer");
  await page.getByLabel("Password").fill("designer-password");
  await page.getByRole("button", { name: "Join" }).click();
  await expect(page).toHaveURL(`${E2E.frontendUrl}/`);
  await invitee.close();

  const again = await browser.newContext();
  const secondPage = await again.newPage();
  await secondPage.goto(link);
  await expect(secondPage.getByRole("heading", { name: "This link doesn’t work any more" })).toBeVisible();
  await again.close();

  await adminPage.reload();
  await expect(adminPage.getByRole("cell", { name: "Dana Designer" })).toBeVisible();
  await expect(adminPage.getByRole("heading", { name: "Pending invites" })).toHaveCount(0);
});

test("a revoked invite link no longer works", async ({ adminApi }) => {
  const token = await invite(adminApi, "revoked@example.com", "member");
  const { invites } = await (await adminApi.get("/api/invites")).json();
  const pending = invites.find((entry: { email: string }) => entry.email === "revoked@example.com");
  expect((await adminApi.delete(`/api/invites/${pending.id}`)).status()).toBe(204);

  const response = await accept(token, "Too Late", "too-late-password");
  expect(response.status).toBe(404);
  expect(response.body.code).toBe("LINK_INVALID");
});

test("a viewer can read everything but change nothing", async ({ adminApi, workspace }) => {
  const token = await invite(adminApi, "viewer@example.com", "viewer");
  expect((await accept(token, "Vic Viewer", "viewer-password")).status).toBe(201);
  const viewer = await signIn({ email: "viewer@example.com", password: "viewer-password" });

  expect((await viewer.api.get(`/api/tasks?projectId=${workspace.projectId}`)).status()).toBe(200);
  expect((await viewer.api.get("/api/clankers")).status()).toBe(200);
  expect(
    (await viewer.api.post("/api/spaces", { data: { name: "Not allowed" } })).status(),
  ).toBe(403);
  expect(
    (await viewer.api.post(`/api/tasks/${workspace.projectId}/run`, { data: {} })).status(),
  ).toBe(403);
  expect((await viewer.api.post("/api/auth/logout")).status()).toBe(200);
  await viewer.api.dispose();
});

test("deactivating someone ends their session at once, and a reset link signs them back in after reactivation", async ({
  adminApi,
}) => {
  const token = await invite(adminApi, "leaver@example.com", "member");
  const { user } = (await accept(token, "Lee Leaver", "leaver-password")).body;
  const leaver = await signIn({ email: "leaver@example.com", password: "leaver-password" });
  expect((await leaver.api.get("/api/auth/me")).status()).toBe(200);

  expect((await adminApi.post(`/api/users/${user.id}/deactivate`)).status()).toBe(200);
  expect((await leaver.api.get("/api/auth/me")).status()).toBe(401);
  const login = await adminApi.post("/api/auth/login", {
    data: { email: "leaver@example.com", password: "leaver-password" },
  });
  expect(login.status()).toBe(401);
  await leaver.api.dispose();

  expect((await adminApi.post(`/api/users/${user.id}/reactivate`)).status()).toBe(200);
  const reset = await adminApi.post(`/api/users/${user.id}/reset-link`);
  expect(reset.status()).toBe(201);
  const resetToken = String((await reset.json()).path).replace("/reset-password/", "");

  const anonymous = await request.newContext({ baseURL: E2E.backendUrl });
  expect(
    (await anonymous.post(`/api/account-links/resets/${resetToken}`, { data: { password: "brand-new-password" } })).status(),
  ).toBe(200);
  expect(
    (await anonymous.post(`/api/account-links/resets/${resetToken}`, { data: { password: "another-password" } })).status(),
  ).toBe(404);
  await anonymous.dispose();

  const back = await signIn({ email: "leaver@example.com", password: "brand-new-password" });
  await back.api.dispose();
});
