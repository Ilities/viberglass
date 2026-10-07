import {
  MODEL_ENDPOINT_KEY_ENV_VAR,
  isObjectRecord,
  modelEndpointHeaders,
  modelEndpointModelsRequest,
  readWorkerModelEndpoint,
} from "@viberglass/types";

interface ReadinessDependencies {
  fetch: (url: string, init: RequestInit) => Promise<Pick<Response, "status">>;
  now: () => number;
  wait: (ms: number) => Promise<void>;
  key?: string;
}

const MINUTE = 60_000;
const WAIT_MINUTES = 15;

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
  const started = deps.now();
  const deadline = started + WAIT_MINUTES * MINUTE;
  const models = modelEndpointModelsRequest(endpoint);
  const headers = { ...models.headers, ...modelEndpointHeaders(endpoint, deps.key) };
  await progress(
    "model-waking",
    `Waking ${endpoint.model} on ${endpoint.name}. A cold start can take several minutes; this run waits up to ${WAIT_MINUTES}.`,
  );
  let reportedMinutes = 0;
  while (deps.now() < deadline) {
    // Progress also keeps the job's heartbeat alive, which the platform gives up on after a few silent minutes.
    const minutes = Math.floor((deps.now() - started) / MINUTE);
    if (minutes > reportedMinutes) {
      reportedMinutes = minutes;
      await progress(
        "model-waking",
        `Still waking ${endpoint.model} on ${endpoint.name}: ${minutes} min so far, waiting up to ${WAIT_MINUTES}.`,
      );
    }
    let status: number | undefined;
    try {
      status = (
        await deps.fetch(models.url, {
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
    `${endpoint.model} on ${endpoint.name} didn't wake up within ${WAIT_MINUTES} minutes. Try again, or keep the deployment warm so it's running before you ask.`,
  );
}
