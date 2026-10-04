import {
  modelEndpointHeaders,
  type ModelEndpointAuth,
  type ModelKeyCheck,
} from "@viberglass/types";

export function buildModelKeyCheckRequest(
  check: {
    auth: ModelEndpointAuth;
    headers?: Record<string, string>;
    post?: ModelKeyCheck["post"];
  },
  key?: string,
): RequestInit {
  const headers = modelEndpointHeaders(
    { auth: check.auth, extraHeaders: check.headers ?? {} },
    key,
  );
  const signal = AbortSignal.timeout(10_000);
  if (!check.post) return { method: "GET", headers, signal };
  return {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify(check.post.body),
    signal,
  };
}
