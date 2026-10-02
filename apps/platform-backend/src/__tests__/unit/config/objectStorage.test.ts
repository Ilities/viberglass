import { objectStorageBucket, objectStorageClientConfig, objectStoragePublicClientConfig } from "@viberglass/types";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

describe("Object storage configuration", () => {
  it("preserves AWS default credential resolution", () => {
    expect(objectStorageClientConfig({ AWS_REGION: "eu-west-2" })).toEqual({ region: "eu-west-2" });
    expect(objectStorageBucket({ AWS_S3_BUCKET: "legacy" })).toBe("legacy");
  });

  it("configures a separate S3 endpoint, signing region and credentials", () => {
    expect(objectStorageClientConfig({
      S3_ENDPOINT: "https://storage.example", S3_REGION: "gra", AWS_REGION: "eu-west-1",
      S3_FORCE_PATH_STYLE: "true", S3_ACCESS_KEY_ID: "storage-key", S3_SECRET_ACCESS_KEY: "storage-secret",
    })).toEqual({
      endpoint: "https://storage.example", region: "gra", forcePathStyle: true,
      credentials: { accessKeyId: "storage-key", secretAccessKey: "storage-secret" },
    });
    expect(objectStorageBucket({ S3_BUCKET: "portable", AWS_S3_BUCKET: "legacy" })).toBe("portable");
  });

  it("rejects partial credentials and malformed options", () => {
    expect(() => objectStorageClientConfig({ S3_ACCESS_KEY_ID: "key" })).toThrow("both");
    expect(() => objectStorageClientConfig({ S3_FORCE_PATH_STYLE: "yes" })).toThrow("true or false");
    expect(() => objectStorageClientConfig({ S3_ENDPOINT: "file:///tmp/bucket" })).toThrow("HTTP(S)");
    expect(() => objectStorageClientConfig({ S3_ENDPOINT: "https://key:secret@storage.example" })).toThrow("embedded credentials");
  });

  it.each([true, false])("signs media URLs against the configured endpoint with path style %s", async (pathStyle) => {
    const client = new S3Client(objectStorageClientConfig({
      S3_ENDPOINT: "https://storage.example", S3_REGION: "gra", S3_FORCE_PATH_STYLE: String(pathStyle),
      S3_ACCESS_KEY_ID: "test-key", S3_SECRET_ACCESS_KEY: "test-secret",
    }));
    try {
      const signed = new URL(await getSignedUrl(client, new GetObjectCommand({ Bucket: "test-bucket", Key: "media/image.png" })));
      expect(signed.hostname).toBe(pathStyle ? "storage.example" : "test-bucket.storage.example");
      expect(signed.pathname).toBe(pathStyle ? "/test-bucket/media/image.png" : "/media/image.png");
      expect(signed.searchParams.get("X-Amz-Credential")).toContain("/gra/s3/aws4_request");
    } finally {
      client.destroy();
    }
  });
});

 it("signs browser downloads separately from internal worker storage", () => {
   const env = { S3_ENDPOINT: "http://minio:9000", S3_PUBLIC_ENDPOINT: "http://localhost:39000", S3_REGION: "local", S3_FORCE_PATH_STYLE: "true" };
   expect(objectStorageClientConfig(env).endpoint).toBe("http://minio:9000");
   expect(objectStoragePublicClientConfig(env)).toMatchObject({ endpoint: "http://localhost:39000", region: "local", forcePathStyle: true });
   expect(objectStoragePublicClientConfig({ S3_ENDPOINT: "https://storage.example" }).endpoint).toBe("https://storage.example");
 });
