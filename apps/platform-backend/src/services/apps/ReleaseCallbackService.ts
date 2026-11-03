import {
  RELEASE_BUILD_LOG_MAX_LENGTH,
  releaseBundleKey,
  type AppRelease,
  type ReleaseBundleGrant,
  type ReleaseCompleteRequest,
} from "@viberglass/types";
import { AppReleaseDAO } from "../../persistence/apps/AppReleaseDAO";
import { JobBootstrapService } from "../job/JobBootstrapService";
import { S3SpaceFilesStore, type SpaceFilesStore } from "../spaceFiles/SpaceFilesStore";

const GRANT_SECONDS = 900;

/** The build asking isn't this release's running build, or the release has its outcome already. */
export class ReleaseCallbackDenied extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReleaseCallbackDenied";
  }
}

/** What a release build asks of the platform: where to upload its bundle, and to record how it went. */
export class ReleaseCallbackService {
  constructor(
    private readonly releases: Pick<AppReleaseDAO, "getByJobId" | "finish"> = new AppReleaseDAO(),
    private readonly bootstraps: Pick<JobBootstrapService, "getBootstrapPayload"> = new JobBootstrapService(),
    private readonly store: Pick<SpaceFilesStore, "bucket" | "sign"> = new S3SpaceFilesStore(),
  ) {}

  async grant(jobId: string, tenantId: string): Promise<ReleaseBundleGrant> {
    const release = await this.buildingRelease(jobId, tenantId);
    const bucket = this.store.bucket();
    if (!bucket) throw new Error("Object storage is not configured");
    return {
      url: await this.store.sign("write", `s3://${bucket}/${releaseBundleKey(release.projectId, release.id)}`, GRANT_SECONDS),
      expiresAt: new Date(Date.now() + GRANT_SECONDS * 1000).toISOString(),
    };
  }

  async complete(jobId: string, tenantId: string, request: ReleaseCompleteRequest): Promise<AppRelease["status"]> {
    const release = await this.buildingRelease(jobId, tenantId);
    const buildLog = request.buildLog.slice(-RELEASE_BUILD_LOG_MAX_LENGTH);
    const finished = await this.releases.finish(
      release.id,
      request.outcome === "ready"
        ? { status: "ready", bundleSha256: request.sha256, bundleBytes: request.bundleBytes, nodeVersion: request.nodeVersion, buildLog }
        : { status: "failed", failureReason: request.reason.slice(0, 2000), buildLog },
    );
    if (!finished) throw new ReleaseCallbackDenied("This release already has its outcome");
    return request.outcome === "ready" ? "ready" : "failed";
  }

  private async buildingRelease(jobId: string, tenantId: string): Promise<AppRelease> {
    const bootstrap = await this.bootstraps.getBootstrapPayload(jobId);
    if (!bootstrap || bootstrap.tenantId !== tenantId || bootstrap.status !== "active") {
      throw new ReleaseCallbackDenied("Only the release's running build can do this");
    }
    const release = await this.releases.getByJobId(jobId);
    if (!release || release.status !== "building") throw new ReleaseCallbackDenied("This run is not building a release");
    return release;
  }
}
