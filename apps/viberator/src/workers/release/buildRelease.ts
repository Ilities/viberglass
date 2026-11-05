import * as fs from "fs";
import * as path from "path";
import { APP_MANIFEST_FILE, JOB_FAILURE_CODE, parseAppManifest, type AppManifest, type ReleaseBuildPayload } from "@viberglass/types";
import type GitService from "../../services/GitService";
import type { GitAuth } from "../../services/gitAuth";
import type { ReleaseCallbackClient } from "../infrastructure/ReleaseCallbackClient";
import { failingWith, JobFailureError } from "../core/JobFailureError";
import { buildHomeDir, runAppBuild } from "./runAppBuild";
import { packBundle, uploadBundle } from "./releaseBundle";

export interface BuildReleaseDeps {
  jobId: string;
  tenantId: string;
  repository: string;
  release: ReleaseBuildPayload;
  workDir: string;
  gitAuth?: GitAuth;
  git: Pick<GitService, "fetchCommit">;
  client: Pick<ReleaseCallbackClient, "storageGrant" | "complete">;
  sendProgress: (step: string, message: string) => Promise<void>;
  runBuild?: typeof runAppBuild;
  upload?: typeof uploadBundle;
}

/** Builds the commit with its manifest's build command, then uploads the result as the release's bundle. */
export async function buildRelease(deps: BuildReleaseDeps): Promise<void> {
  const { jobId, tenantId, release, workDir } = deps;
  fs.mkdirSync(workDir, { recursive: true });

  await deps.sendProgress("clone", `Fetching ${release.commitSha.slice(0, 7)}`);
  const repoDir = await failingWith(JOB_FAILURE_CODE.REPOSITORY_ACCESS_FAILED, () =>
    deps.git.fetchCommit(deps.repository, release.commitSha, workDir, deps.gitAuth),
  );

  const manifest = readManifest(repoDir);
  if ("error" in manifest) return fail(deps, manifest.error, "");

  await deps.sendProgress("build", "Building the app");
  const built = await (deps.runBuild ?? runAppBuild)(manifest.manifest.build, repoDir, buildHomeDir(workDir));
  if (!built.succeeded) return fail(deps, built.reason ?? "The build failed", built.log);

  await deps.sendProgress("bundle", "Packing the release");
  const bundleFile = path.join(workDir, "bundle.tar.gz");
  const bundle = await packBundle(repoDir, bundleFile);
  const grant = await deps.client.storageGrant(jobId, tenantId);
  await (deps.upload ?? uploadBundle)(grant.url, bundleFile, bundle.bytes);
  await deps.client.complete(jobId, tenantId, {
    outcome: "ready",
    sha256: bundle.sha256,
    bundleBytes: bundle.bytes,
    nodeVersion: process.version,
    buildLog: built.log,
    settings: manifest.manifest.settings,
  });
}

function readManifest(repoDir: string): { manifest: AppManifest } | { error: string } {
  const file = path.join(repoDir, APP_MANIFEST_FILE);
  if (!fs.existsSync(file)) return { error: `The app has no ${APP_MANIFEST_FILE}` };
  try {
    return parseAppManifest(JSON.parse(fs.readFileSync(file, "utf8")));
  } catch {
    return { error: `${APP_MANIFEST_FILE} isn't valid JSON` };
  }
}

async function fail(deps: BuildReleaseDeps, reason: string, buildLog: string): Promise<never> {
  await deps.client.complete(deps.jobId, deps.tenantId, { outcome: "failed", reason, buildLog });
  throw new JobFailureError(JOB_FAILURE_CODE.APP_BUILD_FAILED, reason);
}
