import { writeFileSync } from "fs";
import { E2E } from "./e2eEnvironment";
import { GitFixtureServer } from "./gitFixtureServer";
import { seedWorkspace } from "./seedWorkspace";
import { SEED_FILE } from "./seededWorkspace";

/**
 * Runs after Playwright has started the backend and frontend (webServer) and
 * before any test: serves the fixture repository and seeds the empty database.
 */
export default async function globalSetup(): Promise<() => Promise<void>> {
  const gitServer = new GitFixtureServer();
  await gitServer.start(E2E.gitFixturePort);

  const seeded = await seedWorkspace();
  writeFileSync(SEED_FILE, JSON.stringify(seeded, null, 2));

  return () => gitServer.stop();
}
