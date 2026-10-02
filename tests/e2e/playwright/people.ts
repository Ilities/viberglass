import { expect, request, type APIRequestContext } from "@playwright/test";
import { E2E } from "./e2eEnvironment";
import { signIn } from "./seedWorkspace";

export async function userId(adminApi: APIRequestContext, email: string): Promise<string> {
  const { users } = await (await adminApi.get("/api/users")).json();
  return users.find((user: { email: string }) => user.email === email).id;
}

/** Invites someone with a role by link and signs them in. */
export async function invite(adminApi: APIRequestContext, role: "guest" | "viewer", name: string, spaceIds: string[] = []) {
  const email = `${role}.${Date.now()}@example.com`;
  const invited = await adminApi.post("/api/invites", { data: { email, role, ...(spaceIds.length > 0 && { spaceIds }) } });
  expect(invited.status()).toBe(201);
  const token = String((await invited.json()).path).replace("/invite/", "");
  const anonymous = await request.newContext({ baseURL: E2E.backendUrl });
  expect((await anonymous.post(`/api/account-links/invites/${token}`, { data: { name, password: `${role}-password` } })).status()).toBe(201);
  await anonymous.dispose();
  return { session: await signIn({ email, password: `${role}-password` }), id: await userId(adminApi, email) };
}
