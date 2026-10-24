import { reportMissingRequiredEnv, validateRequiredEnv } from "../../../config/requiredEnv";

const complete = {
  NODE_ENV: "production",
  DB_HOST: "localhost",
  DB_PORT: "5432",
  DB_NAME: "viberglass",
  DB_USER: "viberglass",
  DB_PASSWORD: "password",
  SECRETS_ENCRYPTION_KEY: "secrets-key",
  WEBHOOK_SECRET_ENCRYPTION_KEY: "webhook-key",
  PLATFORM_FRONTEND_URL: "https://viberglass.example.com",
};

const withoutDatabaseVariables = {
  ...complete,
  DB_HOST: undefined,
  DB_PORT: undefined,
  DB_NAME: undefined,
  DB_USER: undefined,
  DB_PASSWORD: undefined,
};

describe("Startup environment validation", () => {
  it("accepts a complete DB_* environment", () => {
    expect(validateRequiredEnv(complete)).toEqual([]);
  });

  it("reports every missing required variable", () => {
    const env = { ...complete, SECRETS_ENCRYPTION_KEY: undefined, PLATFORM_FRONTEND_URL: undefined };

    expect(validateRequiredEnv(env)).toEqual(["SECRETS_ENCRYPTION_KEY", "PLATFORM_FRONTEND_URL"]);
  });

  it("accepts DATABASE_URL without the DB_* variables", () => {
    expect(validateRequiredEnv({ ...withoutDatabaseVariables, DATABASE_URL: "postgres://viberglass:password@localhost:5432/viberglass" })).toEqual([]);
  });

  it("reports a partial DB_* group as missing", () => {
    const env = { ...complete, DB_PASSWORD: undefined, DB_USER: undefined };

    expect(validateRequiredEnv(env)).toEqual(["DB_USER, DB_PASSWORD (or DATABASE_URL)"]);
  });

  it("treats blank values as missing", () => {
    expect(validateRequiredEnv({ ...complete, SECRETS_ENCRYPTION_KEY: "  " })).toEqual(["SECRETS_ENCRYPTION_KEY"]);
  });

  it("exempts only PLATFORM_FRONTEND_URL in the test environment", () => {
    expect(validateRequiredEnv({ ...complete, NODE_ENV: "test", PLATFORM_FRONTEND_URL: undefined })).toEqual([]);

    const env = { NODE_ENV: "test", SECRETS_ENCRYPTION_KEY: undefined };
    expect(validateRequiredEnv(env)).toEqual(["DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD (or DATABASE_URL)", "SECRETS_ENCRYPTION_KEY", "WEBHOOK_SECRET_ENCRYPTION_KEY"]);
  });

  it("never requires optional integrations", () => {
    expect(validateRequiredEnv({ ...complete, S3_BUCKET: "", SMTP_URL: "", PREVIEW_PORT: "not-a-port" })).toEqual([]);
  });

  it("prints the report as one stderr block", () => {
    const error = jest.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      reportMissingRequiredEnv(["SECRETS_ENCRYPTION_KEY", "DB_PASSWORD (or DATABASE_URL)"]);

      expect(error).toHaveBeenCalledTimes(1);
      expect(error).toHaveBeenCalledWith(
        "Missing required environment variables:\n- SECRETS_ENCRYPTION_KEY\n- DB_PASSWORD (or DATABASE_URL)",
      );
    } finally {
      error.mockRestore();
    }
  });
});
