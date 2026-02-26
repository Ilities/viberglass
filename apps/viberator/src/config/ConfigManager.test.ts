import { createLogger, transports } from "winston";
import { ConfigManager } from "./ConfigManager";

function createSilentLogger() {
  return createLogger({
    silent: true,
    transports: [new transports.Console({ silent: true })],
  });
}

describe("ConfigManager agent api key resolution", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.QWEN_CLI_API_KEY = "";
    process.env.DASHSCOPE_API_KEY = "";
    process.env.GEMINI_API_KEY = "";
    process.env.GOOGLE_API_KEY = "";
    delete process.env.AWS_REGION;
    delete process.env.SSM_PARAMETER_PATH;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  test("uses QWEN_CLI_API_KEY as the qwen-cli key", async () => {
    process.env.QWEN_CLI_API_KEY = "qwen-key";
    process.env.DASHSCOPE_API_KEY = "dashscope-key";

    const manager = new ConfigManager(createSilentLogger());
    await manager.loadConfiguration();

    const qwen = manager.getAgentConfig("qwen-cli");
    expect(qwen?.apiKey).toBe("qwen-key");
  });

  test("does not populate qwen-cli key from DASHSCOPE_API_KEY", async () => {
    process.env.QWEN_CLI_API_KEY = "";
    process.env.DASHSCOPE_API_KEY = "dashscope-key";

    const manager = new ConfigManager(createSilentLogger());
    await manager.loadConfiguration();

    const qwen = manager.getAgentConfig("qwen-cli");
    expect(qwen?.apiKey).toBe("");
  });

  test("uses GEMINI_API_KEY as the gemini-cli key", async () => {
    process.env.GEMINI_API_KEY = "gemini-key";
    process.env.GOOGLE_API_KEY = "google-key";

    const manager = new ConfigManager(createSilentLogger());
    await manager.loadConfiguration();

    const gemini = manager.getAgentConfig("gemini-cli");
    expect(gemini?.apiKey).toBe("gemini-key");
  });

  test("falls back to GOOGLE_API_KEY for gemini-cli", async () => {
    process.env.GEMINI_API_KEY = "";
    process.env.GOOGLE_API_KEY = "google-key";

    const manager = new ConfigManager(createSilentLogger());
    await manager.loadConfiguration();

    const gemini = manager.getAgentConfig("gemini-cli");
    expect(gemini?.apiKey).toBe("google-key");
  });
});
