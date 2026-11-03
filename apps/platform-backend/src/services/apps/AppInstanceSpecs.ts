import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { appDataPath, releaseBundleKey, type AppHostTarget, type AppInstanceSpec, type AppRelease } from "@viberglass/types";
import { appDataStorage } from "./appHostingConfig";
import { appRuntimeImage } from "./appImages";
import type { AppDataCredentials } from "./StsAppDataCredentials";

type Env = Record<string, string | undefined>;

// An instance that restarts keeps its unpacked bundle, so the link is only needed for the first start.
const BUNDLE_URL_SECONDS = 24 * 60 * 60;

/** What the runtime image needs to run one release: its bundle, and its app's replica with credentials for it. */
export class AppInstanceSpecs {
  constructor(
    private readonly credentials: AppDataCredentials,
    private readonly env: () => Env = () => process.env,
  ) {}

  async specFor(target: AppHostTarget, release: AppRelease): Promise<AppInstanceSpec> {
    if (!release.bundleSha256) throw new Error(`Release ${release.commitSha.slice(0, 7)} has no bundle`);
    const env = this.env();
    const storage = appDataStorage(env);
    return {
      projectId: release.projectId,
      image: appRuntimeImage(target, env),
      env: {
        VIBERGLASS_BUNDLE_URL: await this.bundleUrl(storage, release),
        VIBERGLASS_BUNDLE_SHA256: release.bundleSha256,
        VIBERGLASS_DATA_BUCKET: storage.bucket,
        VIBERGLASS_DATA_PATH: appDataPath(release.projectId),
        VIBERGLASS_DATA_REGION: storage.client.region,
        ...(storage.client.endpoint ? { VIBERGLASS_DATA_ENDPOINT: storage.client.endpoint } : {}),
        ...(storage.client.forcePathStyle ? { VIBERGLASS_DATA_FORCE_PATH_STYLE: "true" } : {}),
        ...(await this.credentials.forApp(release.projectId)),
      },
    };
  }

  private async bundleUrl(storage: ReturnType<typeof appDataStorage>, release: AppRelease): Promise<string> {
    const client = new S3Client(storage.client);
    try {
      const command = new GetObjectCommand({ Bucket: storage.bucket, Key: releaseBundleKey(release.projectId, release.id) });
      return await getSignedUrl(client, command, { expiresIn: BUNDLE_URL_SECONDS });
    } finally {
      client.destroy();
    }
  }
}
