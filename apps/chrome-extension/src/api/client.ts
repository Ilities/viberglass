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

function sendMessage<T>(message: unknown): Promise<T> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      if (response?.error) {
        reject(new ApiError(response.status ?? 0, response.error));
        return;
      }
      resolve(response);
    });
  });
}

export async function apiRequest(
  path: string,
  options: RequestInit = {},
): Promise<{ data: unknown }> {
  const baseUrl = await getPlatformUrl();
  const auth = await getAuth();

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (options.headers) {
    const h = options.headers instanceof Headers
      ? Object.fromEntries(options.headers.entries())
      : Array.isArray(options.headers)
        ? Object.fromEntries(options.headers)
        : options.headers;
    Object.assign(headers, h);
  }
  if (auth?.token) {
    headers["Authorization"] = `Bearer ${auth.token}`;
  }

  const result = await sendMessage<{
    ok: boolean;
    status: number;
    body: unknown;
  }>({
    type: "API_REQUEST",
    data: {
      url: `${baseUrl}${path}`,
      method: options.method ?? "GET",
      headers,
      body: options.body?.toString(),
    },
  });

  if (!result.ok) {
    const message =
      typeof result.body === "object" && result.body !== null && "error" in result.body
        ? String((result.body as { error: unknown }).error)
        : `HTTP ${result.status}`;
    throw new ApiError(result.status, message, result.body);
  }

  return { data: result.body };
}

export async function apiJson<T>(path: string, options?: RequestInit): Promise<T> {
  const result = await apiRequest(path, options);
  return result.data as T;
}
