import { APIRequestContext } from "@playwright/test";
import { writeFileSync } from "fs";
import { E2E } from "./e2eEnvironment";
import { HARNESSES, harnessImage, type HarnessUnderTest } from "./harnessMatrix";
import { MOCK_MODEL, MockModelServer } from "./mockModel/MockModelServer";
import { createSecret, findDockerStrategyId, readEntity, readId, signIn, waitForClankerActive } from "./seedWorkspace";
import { test as smokeTest } from "./smokeFixtures";

export const MOCK_MODEL_KEY = "mock-model-key";

interface HarnessTestFixtures {
  /** Attaches what the harness sent the mock model to a test that fails. */
  modelRequestsOnFailure: void;
}

interface HarnessWorkerFixtures {
  harness: HarnessUnderTest;
  mockModel: MockModelServer;
  /** A runner on the harness's image, with the mock model as its workspace model endpoint. */
  harnessRunnerId: string;
}

async function createHarnessRunner(api: APIRequestContext, harness: HarnessUnderTest): Promise<string> {
  // Playwright starts a new worker after a failed test, which creates its own runner.
  const suffix = Date.now();
  const keyId = await createSecret(api, `${harness.name} mock model key ${suffix}`, MOCK_MODEL_KEY);
  const path = harness.apiFormat === "anthropic-messages" ? "" : "/v1";
  const endpoint = {
    name: `Mock model for ${harness.name} ${suffix}`,
    baseUrl: `${E2E.workerReachableMockModelUrl}${path}`,
    apiFormat: harness.apiFormat,
    auth: { scheme: "bearer" },
    secretId: keyId,
    extraHeaders: {},
    models: [MOCK_MODEL],
    mayColdStart: false,
  };
  // As the endpoint form does: check it, then save the models and context lengths it reports. The
  // backend runs on the host, where the workers' address for the mock doesn't resolve.
  const checked = await readEntity(
    await api.post("/api/model-endpoints/check", { data: { ...endpoint, baseUrl: `http://localhost:${E2E.mockModelPort}${path}` } }),
    `Checking the mock model endpoint for ${harness.name}`,
  );
  const endpointId = await readId(
    await api.post("/api/model-endpoints", { data: { ...endpoint, contextWindows: checked.contextWindows } }),
    `Creating the mock model endpoint for ${harness.name}`,
  );
  const clankerId = await readId(
    await api.post("/api/clankers", {
      data: {
        name: `${harness.name} on the mock model ${suffix}`,
        agent: harness.agent,
        secretBindings: [],
        modelEndpoint: { endpointId, model: MOCK_MODEL },
        deploymentStrategyId: await findDockerStrategyId(api),
        deploymentConfig: {
          version: 1,
          agent: { type: harness.agent },
          strategy: { type: "docker", provisioningMode: "prebuilt", containerImage: harnessImage(harness) },
        },
      },
    }),
    `Creating the ${harness.name} runner`,
  );
  await readEntity(await api.post(`/api/clankers/${clankerId}/start`), `Starting the ${harness.name} runner`);
  await waitForClankerActive(api, clankerId);
  return clankerId;
}

export const test = smokeTest.extend<HarnessTestFixtures, HarnessWorkerFixtures>({
  harness: [HARNESSES[0], { option: true, scope: "worker" }],
  mockModel: [
    async ({}, use) => {
      const server = new MockModelServer(MOCK_MODEL_KEY);
      await server.start(E2E.mockModelPort);
      await use(server);
      await server.stop();
    },
    { scope: "worker" },
  ],
  harnessRunnerId: [
    async ({ harness, mockModel: _started }, use) => {
      const session = await signIn(E2E.admin);
      await use(await createHarnessRunner(session.api, harness));
      await session.api.dispose();
    },
    { scope: "worker" },
  ],
  modelRequestsOnFailure: [
    async ({ mockModel }, use, testInfo) => {
      const from = mockModel.requests.length;
      await use();
      if (testInfo.status !== testInfo.expectedStatus) {
        const path = testInfo.outputPath("model-requests.json");
        writeFileSync(path, JSON.stringify(mockModel.requests.slice(from), null, 2));
        await testInfo.attach("model-requests.json", { path, contentType: "application/json" });
      }
    },
    { auto: true },
  ],
});

export { expect } from "@playwright/test";
