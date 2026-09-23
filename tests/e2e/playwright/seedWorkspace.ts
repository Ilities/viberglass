import { APIRequestContext, APIResponse, request } from "@playwright/test";
import { E2E } from "./e2eEnvironment";

export interface SeededWorkspace {
  projectId: string;
  projectSlug: string;
  clankerId: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Routes answer either with the entity or with `{ success, data }`. */
async function readEntity(response: APIResponse, what: string): Promise<Record<string, unknown>> {
  if (!response.ok()) {
    throw new Error(`${what} failed: ${response.status()} ${await response.text()}`);
  }
  const body: unknown = await response.json();
  const entity = isRecord(body) && isRecord(body.data) ? body.data : body;
  if (!isRecord(entity)) throw new Error(`${what} returned no object`);
  return entity;
}

async function readId(response: APIResponse, what: string): Promise<string> {
  const entity = await readEntity(response, what);
  if (typeof entity.id !== "string") throw new Error(`${what} returned no id`);
  return entity.id;
}

async function findDockerStrategyId(api: APIRequestContext): Promise<string> {
  const response = await api.get("/api/deployment-strategies");
  const body: unknown = await response.json();
  const list = isRecord(body) && Array.isArray(body.data) ? body.data : body;
  if (!Array.isArray(list)) throw new Error("Deployment strategies not listed");
  const docker = list.find((s) => isRecord(s) && s.name === "docker");
  if (!isRecord(docker) || typeof docker.id !== "string") {
    throw new Error("Docker deployment strategy missing");
  }
  return docker.id;
}

export interface SignedInSession {
  /** Carries the session cookie. */
  api: APIRequestContext;
  /** Bearer token the frontend keeps in localStorage. */
  token: string;
}

export async function signIn(account: {
  email: string;
  password: string;
}): Promise<SignedInSession> {
  const api = await request.newContext({ baseURL: E2E.backendUrl });
  const session = await readEntity(
    await api.post("/api/auth/login", {
      data: { email: account.email, password: account.password },
    }),
    `Login as ${account.email}`,
  );
  if (typeof session.token !== "string") {
    throw new Error(`Login as ${account.email} returned no token`);
  }
  return { api, token: session.token };
}

/**
 * Seeds an empty database through the public API, the same way a first user
 * would: first admin, a member, a fake-agent runner and a project whose
 * repository is the local git fixture.
 */
export async function seedWorkspace(): Promise<SeededWorkspace> {
  const api = await request.newContext({ baseURL: E2E.backendUrl });

  const setupStatus = await readEntity(
    await api.get("/api/auth/setup-status"),
    "Checking setup status",
  );
  if (setupStatus.requiresInitialUser !== true) {
    throw new Error(
      "The e2e database is not empty. Run `npm test` in tests/e2e, which resets it first.",
    );
  }

  await readEntity(
    await api.post("/api/auth/register", { data: E2E.admin }),
    "Registering the first admin",
  );
  await readEntity(
    await api.post("/api/users", { data: { ...E2E.member, role: "member" } }),
    "Creating the member",
  );

  const clankerId = await readId(
    await api.post("/api/clankers", {
      data: {
        name: "Fake Agent",
        agent: "fake",
        deploymentStrategyId: await findDockerStrategyId(api),
        deploymentConfig: {
          version: 1,
          agent: { type: "fake" },
          strategy: { type: "docker", containerImage: E2E.fakeWorkerImage },
        },
      },
    }),
    "Creating the fake runner",
  );
  // Docker "start" always rebuilds the worker image under the runner's tag,
  // which would replace the pre-built fake image. Mark it active instead; every
  // run re-checks that the image exists before it starts.
  await readEntity(
    await api.put(`/api/clankers/${clankerId}`, { data: { status: "active" } }),
    "Activating the fake runner",
  );

  const integrationId = await readId(
    await api.post("/api/integrations", {
      data: { name: "GitHub", system: "github", config: {} },
    }),
    "Creating the SCM integration",
  );

  const project = await readEntity(
    await api.post("/api/projects", { data: { name: "E2E Space" } }),
    "Creating the project",
  );
  const projectId = String(project.id);

  await readEntity(
    await api.post(`/api/integrations/project/${projectId}/link`, {
      data: { integrationId, isPrimary: true },
    }),
    "Linking the integration",
  );
  await readEntity(
    await api.put(`/api/projects/${projectId}/scm-config`, {
      data: {
        integrationId,
        sourceRepository: E2E.workerReachableRepositoryUrl,
        baseBranch: "main",
      },
    }),
    "Configuring the repository",
  );

  await api.dispose();
  return { projectId, projectSlug: String(project.slug), clankerId };
}
