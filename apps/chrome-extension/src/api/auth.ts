import { apiJson, apiRequest } from "./client";
import type { AuthState } from "@/types";

export async function login(
  email: string,
  password: string,
): Promise<AuthState> {
  const result = await apiRequest("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  const data = result.data as { token: string; user: AuthState["user"] };
  return { token: data.token, user: data.user };
}

export async function getMe(): Promise<AuthState["user"]> {
  const result = await apiJson<{ user: AuthState["user"] }>("/api/auth/me");
  return result.user;
}

export async function logout(): Promise<void> {
  await apiRequest("/api/auth/logout", { method: "POST" });
}
