import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { AppDataCopier, litestreamConfig, restoreEnv } from "../../../../services/apps/AppDataCopier";

const send = jest.fn();
jest.mock("@aws-sdk/client-s3", () => ({
  S3Client: jest.fn().mockImplementation(() => ({ send, destroy: jest.fn() })),
  PutObjectCommand: jest.fn().mockImplementation((input) => ({ put: input })),
  DeleteObjectCommand: jest.fn().mockImplementation((input) => ({ delete: input })),
}));

const env = {
  PATH: "/usr/bin",
  S3_BUCKET: "viberglass",
  S3_ENDPOINT: "http://storage:9000",
  S3_FORCE_PATH_STYLE: "true",
  S3_ACCESS_KEY_ID: "platform-key",
  S3_SECRET_ACCESS_KEY: "platform-secret",
  DATABASE_URL: "postgres://secret",
};

describe("AppDataCopier", () => {
  beforeEach(() => send.mockReset().mockResolvedValue({}));

  it("restores the replica into one file and stores it", async () => {
    let config = "";
    const run = jest.fn(async (_command: string, args: string[], _env: Record<string, string | undefined>) => {
      config = readFileSync(args[args.indexOf("-config") + 1], "utf8");
      writeFileSync(args[args.indexOf("-o") + 1], "SQLite format 3\0");
    });

    const copied = await new AppDataCopier(() => env, run).copy("space-1", "spaces/space-1/data-grants/g-1/app.db");

    expect(copied.bytes).toBe(16);
    const [command, args, runEnv] = run.mock.calls[0];
    expect(command).toBe("litestream");
    expect(args.slice(0, 5)).toEqual(["restore", "-config", expect.any(String), "-no-expand-env", "-if-replica-exists"]);
    expect(config).toContain('path: "spaces/space-1/app-data"');
    expect(runEnv).toMatchObject({ AWS_ACCESS_KEY_ID: "platform-key", AWS_SECRET_ACCESS_KEY: "platform-secret" });
    expect(runEnv).not.toHaveProperty("DATABASE_URL");
    expect(send).toHaveBeenCalledWith({ put: expect.objectContaining({ Bucket: "viberglass", Key: "spaces/space-1/data-grants/g-1/app.db", ContentLength: 16 }) });
    expect(existsSync(dirname(args[2]))).toBe(false);
  });

  it("says the app has no data when its replica is empty", async () => {
    const run = jest.fn().mockResolvedValue(undefined);

    await expect(new AppDataCopier(() => env, run).copy("space-1", "key")).rejects.toMatchObject({ code: "NO_DATA" });
    expect(send).not.toHaveBeenCalled();
  });
});

describe("litestreamConfig", () => {
  it("points Litestream at the app's replica in the platform's storage", () => {
    expect(litestreamConfig(env, "/tmp/x/app.db", "spaces/space-1/app-data")).toBe(
      [
        "dbs:",
        '  - path: "/tmp/x/app.db"',
        "    replica:",
        "      type: s3",
        '      bucket: "viberglass"',
        '      path: "spaces/space-1/app-data"',
        '      region: "eu-west-1"',
        '      endpoint: "http://storage:9000"',
        "      force-path-style: true",
        "",
      ].join("\n"),
    );
  });
});

describe("restoreEnv", () => {
  it("leaves AWS's own credential chain alone when the platform has no keys", () => {
    expect(restoreEnv({ PATH: "/bin", AWS_CONTAINER_CREDENTIALS_RELATIVE_URI: "/v2/creds", SECRET: "x" })).toEqual({
      PATH: "/bin",
      AWS_CONTAINER_CREDENTIALS_RELATIVE_URI: "/v2/creds",
    });
  });
});
