import { writeFileSync } from "fs";
import { E2E } from "./e2eEnvironment";
import { GIT_FIXTURE_DIR_ENV, GitFixtureServer } from "./gitFixtureServer";
import { seedWorkspace } from "./seedWorkspace";
import { SEED_FILE } from "./seededWorkspace";

/**
 * Runs after Playwright has started the backend and frontend (webServer) and
 * before any test: serves the fixture repository and seeds the empty database.
 */
export default async function globalSetup(): Promise<() => Promise<void>> {
  const gitServer = new GitFixtureServer();
  await gitServer.start(E2E.gitFixturePort);
  // Tests run in their own processes, which inherit what's set here.
  process.env[GIT_FIXTURE_DIR_ENV] = gitServer.repositoryDir;

  const seeded = await seedWorkspace();
  writeFileSync(SEED_FILE, JSON.stringify(seeded, null, 2));

  return () => gitServer.stop();
}
