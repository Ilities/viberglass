import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { appDataPath, liveAppInstance, releaseBundleKey, type AppHostTarget, type AppInstanceSpec, type AppRelease } from "@viberglass/types";
import { appDataStorage } from "./appHostingConfig";
import { appRuntimeImage } from "./appImages";
import type { AppSettingsEnv } from "./AppSettingsEnv";
import type { AppDataCredentials } from "./StsAppDataCredentials";

type Env = Record<string, string | undefined>;

// An instance that restarts keeps its unpacked bundle, so the link is only needed for the first start.
const BUNDLE_URL_SECONDS = 24 * 60 * 60;

/**
 * Which copy of an app runs a release: the live app, which replicates its data,
 * or a preview, which starts from a copy of the live data and keeps nothing.
 */
export type AppInstanceRole = { kind: "live" } | { kind: "preview"; instance: string };

/** An instance to create, and when the storage credentials in it expire; null when the host's role supplies them. */
export interface AppLaunch {
  spec: AppInstanceSpec;
  credentialsExpireAt: Date | null;
}

/** What the runtime image needs to run one release: its bundle, its app's replica with credentials for it, and the app's settings. */
export class AppInstanceSpecs {
  constructor(
    private readonly credentials: AppDataCredentials,
    private readonly settings: Pick<AppSettingsEnv, "forInstance">,
    private readonly env: () => Env = () => process.env,
  ) {}

  async specFor(target: AppHostTarget, release: AppRelease, role: AppInstanceRole = { kind: "live" }): Promise<AppLaunch> {
    if (!release.bundleSha256) throw new Error(`Release ${release.commitSha.slice(0, 7)} has no bundle`);
    const env = this.env();
    const storage = appDataStorage(env);
    const preview = role.kind === "preview";
    // On ECS each App space's tasks have a role of their own, and a task ECS replaces needs the bundle long after any link expired.
    const taskRole = target === "ecs";
    const settings = await this.settings.forInstance(release.projectId, preview, target);
    const credentials = taskRole ? null : await (preview ? this.credentials.forPreview(release.projectId) : this.credentials.forApp(release.projectId));
    const spec: AppInstanceSpec = {
      instance: preview ? role.instance : liveAppInstance(release.projectId),
      projectId: release.projectId,
      image: appRuntimeImage(target, env),
      env: {
        ...settings.env,
        ...(taskRole
          ? { VIBERGLASS_BUNDLE_KEY: releaseBundleKey(release.projectId, release.id) }
          : { VIBERGLASS_BUNDLE_URL: await this.bundleUrl(storage, release) }),
        VIBERGLASS_BUNDLE_SHA256: release.bundleSha256,
        VIBERGLASS_DATA_BUCKET: storage.bucket,
        VIBERGLASS_DATA_PATH: appDataPath(release.projectId),
        VIBERGLASS_DATA_REGION: storage.client.region,
        ...(storage.client.endpoint ? { VIBERGLASS_DATA_ENDPOINT: storage.client.endpoint } : {}),
        ...(storage.client.forcePathStyle ? { VIBERGLASS_DATA_FORCE_PATH_STYLE: "true" } : {}),
        ...(preview ? { VIBERGLASS_DATA_MODE: "preview" } : {}),
        ...credentials?.env,
      },
      ...(settings.secretRefs.length > 0 ? { secretRefs: settings.secretRefs } : {}),
    };
    return { spec, credentialsExpireAt: credentials?.expiresAt ?? null };
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
