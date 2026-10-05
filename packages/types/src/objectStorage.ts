type StorageEnvironment = Record<string, string | undefined>;

export interface ObjectStorageClientConfig {
  region: string;
  endpoint?: string;
  forcePathStyle?: boolean;
  credentials?: { accessKeyId: string; secretAccessKey: string; sessionToken?: string };
}

/** Shared SDK options; unset fields preserve the AWS SDK's credential and endpoint defaults. */
export function objectStorageClientConfig(env: StorageEnvironment, region?: string): ObjectStorageClientConfig {
  const endpoint = env.S3_ENDPOINT?.trim();
  if (endpoint) {
    const url = new URL(endpoint);
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) {
      throw new Error("S3_ENDPOINT must be an HTTP(S) URL without embedded credentials");
    }
  }
  const style = env.S3_FORCE_PATH_STYLE?.trim();
  if (style && style !== "true" && style !== "false") {
    throw new Error("S3_FORCE_PATH_STYLE must be true or false");
  }
  const accessKeyId = env.S3_ACCESS_KEY_ID;
  const secretAccessKey = env.S3_SECRET_ACCESS_KEY;
  if (Boolean(accessKeyId) !== Boolean(secretAccessKey)) {
    throw new Error("Set both S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY");
  }
  return {
    region: region || env.S3_REGION?.trim() || env.AWS_REGION || "eu-west-1",
    ...(endpoint ? { endpoint } : {}),
    ...(style ? { forcePathStyle: style === "true" } : {}),
    ...(accessKeyId && secretAccessKey ? {
      credentials: { accessKeyId, secretAccessKey, ...(env.S3_SESSION_TOKEN ? { sessionToken: env.S3_SESSION_TOKEN } : {}) },
    } : {}),
  };
}

export function objectStorageBucket(env: StorageEnvironment): string {
  return env.S3_BUCKET?.trim() || env.AWS_S3_BUCKET?.trim() || "";
}

export function objectStoragePublicClientConfig(env: StorageEnvironment): ObjectStorageClientConfig {
  return objectStorageClientConfig({ ...env, S3_ENDPOINT: env.S3_PUBLIC_ENDPOINT || env.S3_ENDPOINT });
}
