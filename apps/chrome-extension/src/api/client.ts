import { getAuth, getPlatformUrl } from "@/storage";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public body?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function apiRequest(
  path: string,
  options: RequestInit = {},
): Promise<Response> {
  const baseUrl = await getPlatformUrl();
  const auth = await getAuth();

  const headers = new Headers(options.headers);
  headers.set("Content-Type", "application/json");

  if (auth?.token) {
    headers.set("Authorization", `Bearer ${auth.token}`);
  }

  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      body = await response.text();
    }
    const message =
      typeof body === "object" && body !== null && "error" in body
        ? String((body as { error: unknown }).error)
        : `HTTP ${response.status}`;
    throw new ApiError(response.status, message, body);
  }

  return response;
}

export async function apiJson<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await apiRequest(path, options);
  return response.json();
}
