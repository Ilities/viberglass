import {
  MODEL_ENDPOINT_KEY_ENV_VAR,
  isObjectRecord,
  modelEndpointHeaders,
  readWorkerModelEndpoint,
} from "@viberglass/types";

interface ReadinessDependencies {
  fetch: (url: string, init: RequestInit) => Promise<Pick<Response, "status">>;
  now: () => number;
  wait: (ms: number) => Promise<void>;
  key?: string;
}

export async function waitForModelEndpoint(
  clankerConfig: Record<string, unknown> | undefined,
  progress: (step: string, message: string) => Promise<void>,
  deps: ReadinessDependencies = {
    fetch,
    now: Date.now,
    wait: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    key: process.env[MODEL_ENDPOINT_KEY_ENV_VAR],
  },
): Promise<void> {
  const config = isObjectRecord(clankerConfig?.deploymentConfig)
    ? clankerConfig.deploymentConfig
    : clankerConfig;
  const endpoint = readWorkerModelEndpoint(config?.resolvedModelEndpoint);
  if (!endpoint?.mayColdStart) return;
  const deadline = deps.now() + 15 * 60_000;
  const headers = modelEndpointHeaders(endpoint, deps.key);
  await progress(
    "model-waking",
    `Waking ${endpoint.model} on ${endpoint.name}…`,
  );
  while (deps.now() < deadline) {
    let status: number | undefined;
    try {
      status = (
        await deps.fetch(`${endpoint.baseUrl.replace(/\/+$/, "")}/models`, {
          method: "GET",
          headers,
          redirect: "error",
          signal: AbortSignal.timeout(Math.min(10_000, deadline - deps.now())),
        })
      ).status;
    } catch {
      /* Network errors are expected while a scaled-down model starts. */
    }
    if (status === 200) {
      await progress("model-ready", `${endpoint.model} is ready`);
      return;
    }
    if (status === 401 || status === 403)
      throw new Error(
        `The model endpoint rejected its credentials (HTTP ${status}).`,
      );
    await deps.wait(Math.min(5000, Math.max(0, deadline - deps.now())));
  }
  throw new Error(
    `Timed out waiting for ${endpoint.model} on ${endpoint.name} to wake up.`,
  );
}
