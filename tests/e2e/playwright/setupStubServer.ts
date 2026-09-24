import { createServer, Server } from "http";
import { E2E } from "./e2eEnvironment";

/** The only credentials the stub accepts. */
export const SETUP_STUB = {
  modelKey: "fake-valid-key",
  gitHubToken: "e2e-github-token",
  repository: "e2e/fixture",
} as const;

/**
 * Stands in for the outside services setup checks: the test model provider's
 * model list (`VIBERGLASS_FAKE_PROVIDER_URL`) and the GitHub API
 * (`GITHUB_API_URL`). The repository points at the git fixture the fake
 * worker clones, so the first task's research really runs.
 */
export class SetupStubServer {
  private server?: Server;

  readonly url = `http://localhost:${E2E.setupStubPort}`;

  async start(): Promise<void> {
    this.server = createServer((req, res) => {
      const authorization = req.headers.authorization ?? "";
      const path = req.url?.split("?")[0] ?? "/";
      const json = (status: number, body: unknown) => {
        res.writeHead(status, { "Content-Type": "application/json" }).end(JSON.stringify(body));
      };

      if (path === "/v1/models") {
        if (authorization === `Bearer ${SETUP_STUB.modelKey}`) return json(200, { data: [{ id: "fake-model" }] });
        return json(401, { error: { message: "Invalid API key" } });
      }

      const repo = /^\/repos\/([^/]+)\/([^/]+)$/.exec(path);
      if (repo) {
        if (authorization !== `Bearer ${SETUP_STUB.gitHubToken}`) return json(401, { message: "Bad credentials" });
        if (`${repo[1]}/${repo[2]}` !== SETUP_STUB.repository) return json(404, { message: "Not Found" });
        return json(200, {
          full_name: SETUP_STUB.repository,
          default_branch: "main",
          private: false,
          permissions: { pull: true, push: true },
          html_url: E2E.workerReachableRepositoryUrl,
        });
      }

      json(404, { message: "Not Found" });
    });
    await new Promise<void>((resolve) => this.server?.listen(E2E.setupStubPort, resolve));
  }

  async stop(): Promise<void> {
    await new Promise<void>((resolve) => (this.server ? this.server.close(() => resolve()) : resolve()));
  }
}
