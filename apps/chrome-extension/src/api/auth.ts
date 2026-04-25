import { apiJson, apiRequest } from "./client";
import { getPlatformUrl } from "@/storage";
import type { AuthState } from "@/types";

export async function login(
  email: string,
  password: string,
): Promise<AuthState> {
  const baseUrl = await getPlatformUrl();
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  if (!response.ok) {
    let message = "Login failed";
    try {
      const body = await response.json();
      if (body.error) message = body.error;
    } catch {}
    throw new Error(message);
  }

  const data = await response.json();
  const auth: AuthState = { token: data.token, user: data.user };
  return auth;
}

export async function getMe(): Promise<AuthState["user"]> {
  const result = await apiJson<{ user: AuthState["user"] }>("/api/auth/me");
  return result.user;
}

export async function logout(): Promise<void> {
  await apiRequest("/api/auth/logout", { method: "POST" });
}
