import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { gzipSync } from "node:zlib";
import { createLogger } from "winston";
import { CodexAuthManager } from "../src/CodexAuthManager";

const logger = createLogger({ silent: true });
const LOGIN = JSON.stringify({ tokens: { access_token: "a", refresh_token: "r1" } });

describe("CodexAuthManager stored login", () => {
  let home: string;
  const sendCodexAuthCache = jest.fn(async () => undefined);

  function manager() {
    return new CodexAuthManager(
      logger,
      { sendCodexAuthCache },
      home,
      async () => undefined,
      { mode: "chatgpt_device_stored", secretName: "CODEX_AUTH_JSON", apiKeySecretName: "OPENAI_API_KEY" },
    );
  }

  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), "codex-auth-"));
    process.env.CODEX_HOME = home;
    sendCodexAuthCache.mockClear();
  });

  afterEach(() => {
    delete process.env.CODEX_HOME;
    delete process.env.CODEX_AUTH_JSON;
    fs.rmSync(home, { recursive: true, force: true });
  });

  it("writes a gzip-encoded login from the environment as plain JSON", async () => {
    process.env.CODEX_AUTH_JSON = `gz+b64:${gzipSync(Buffer.from(LOGIN)).toString("base64")}`;

    await manager().materializeAuthCacheFromEnv();

    expect(JSON.parse(fs.readFileSync(path.join(home, "auth.json"), "utf-8"))).toEqual(JSON.parse(LOGIN));
  });

  it("uploads the login only when Codex refreshed it during the run", async () => {
    process.env.CODEX_AUTH_JSON = LOGIN;
    const codex = manager();
    await codex.materializeAuthCacheFromEnv();

    await codex.uploadIfRefreshed("job-1", "tenant-1");
    expect(sendCodexAuthCache).not.toHaveBeenCalled();

    const refreshed = JSON.stringify({ tokens: { access_token: "b", refresh_token: "r2" } });
    fs.writeFileSync(path.join(home, "auth.json"), refreshed);
    await codex.uploadIfRefreshed("job-1", "tenant-1");

    expect(sendCodexAuthCache).toHaveBeenCalledWith("job-1", "tenant-1", {
      secretName: "CODEX_AUTH_JSON",
      authJson: refreshed,
    });
  });
});
