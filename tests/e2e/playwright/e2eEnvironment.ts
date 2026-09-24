/**
 * Ports, URLs and accounts for the smoke suite. The ports differ from the dev
 * stack (3000/8888/5432) so both can run side by side.
 */
export const E2E = {
  frontendPort: 3100,
  backendPort: 8988,
  postgresPort: 5433,
  gitFixturePort: 8989,
  /** Used only by the late-database journey, which runs its own backend. */
  lateBackendPort: 8990,
  latePostgresPort: 5434,
  /** Used only by the first-run setup journey: its own empty workspace, plus a stub for GitHub and the test model provider. */
  firstRunBackendPort: 8991,
  firstRunPostgresPort: 5435,
  setupStubPort: 8992,
  get frontendUrl() {
    return `http://localhost:${this.frontendPort}`;
  },
  get backendUrl() {
    return `http://localhost:${this.backendPort}`;
  },
  /** Worker containers run on a bridge network and reach the host this way. */
  get workerReachableBackendUrl() {
    return `http://host.docker.internal:${this.backendPort}`;
  },
  get workerReachableRepositoryUrl() {
    return `http://host.docker.internal:${this.gitFixturePort}/fixture.git`;
  },
  fakeWorkerImage: "viberator-worker-fake:latest",
  admin: {
    name: "E2E Admin",
    email: "e2e-admin@example.com",
    password: "e2e-admin-password",
  },
  member: {
    name: "E2E Member",
    email: "e2e-member@example.com",
    password: "e2e-member-password",
  },
} as const;

/** Environment for a backend process on the host, pointed at an e2e database. */
export function backendEnvironment(options: {
  port: number;
  postgresPort: number;
}): Record<string, string> {
  return {
    DB_HOST: "localhost",
    DB_PORT: String(options.postgresPort),
    DB_NAME: "viberglass-e2e",
    DB_USER: "viberglass",
    DB_PASSWORD: "viberglass",
    PORT: String(options.port),
    NODE_ENV: "development",
    LOG_LEVEL: "warn",
    RUN_MIGRATIONS_ON_STARTUP: "true",
    ALLOWED_ORIGINS: E2E.frontendUrl,
    PLATFORM_FRONTEND_URL: E2E.frontendUrl,
    PLATFORM_API_URL: `http://host.docker.internal:${options.port}`,
    SECRETS_ENCRYPTION_KEY: "e2e-secrets-key",
    WEBHOOK_SECRET_ENCRYPTION_KEY: "e2e-webhook-key",
    TICKET_MEDIA_DISK_ROOT: "/tmp/viberglass-e2e-ticket-media",
    TICKET_MEDIA_CONTAINER_ROOT: "/tmp/viberglass-e2e-ticket-media",
    SESSION_STATE_ROOT: "/tmp/viberglass-e2e-session-state",
    OTEL_SDK_DISABLED: "true",
  };
}
