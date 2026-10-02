const mockSend = jest.fn();

jest.mock("@aws-sdk/client-ssm", () => ({
  SSMClient: jest.fn(() => ({ send: mockSend })),
  GetParameterCommand: jest.fn((input) => input),
}));

import { createLogger } from "winston";
import { CredentialProvider } from "./CredentialProvider";

const logger = createLogger({ silent: true });

describe("CredentialProvider", () => {
  beforeEach(() => {
    mockSend.mockReset();
    delete process.env.VIBERGLASS_TEST_KEY;
  });

  it("uses the value a Docker worker was started with", async () => {
    process.env.VIBERGLASS_TEST_KEY = "from-env";

    await expect(
      new CredentialProvider(logger).getCredentials([{ envVar: "VIBERGLASS_TEST_KEY", ssmPath: "/p/x" }]),
    ).resolves.toEqual({ VIBERGLASS_TEST_KEY: "from-env" });
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("reads the exact SSM path the platform sent", async () => {
    mockSend.mockResolvedValue({ Parameter: { Value: "from-ssm" } });

    await expect(
      new CredentialProvider(logger).getCredentials([
        { envVar: "VIBERGLASS_TEST_KEY", ssmPath: "/viberator/secrets/11111111-1111-1111-1111-111111111111" },
      ]),
    ).resolves.toEqual({ VIBERGLASS_TEST_KEY: "from-ssm" });
    expect(mockSend).toHaveBeenCalledWith({
      Name: "/viberator/secrets/11111111-1111-1111-1111-111111111111",
      WithDecryption: true,
    });
  });

  it("reports a credential with neither an env value nor an SSM path as missing", async () => {
    const provider = new CredentialProvider(logger);
    const requests = [{ envVar: "VIBERGLASS_TEST_KEY", ssmPath: null }];
    const credentials = await provider.getCredentials(requests);

    expect(credentials).toEqual({ VIBERGLASS_TEST_KEY: undefined });
    expect(provider.validateRequired(credentials, requests)).toEqual({ valid: false, missing: ["VIBERGLASS_TEST_KEY"] });
  });
});

describe("Bootstrap credential delivery", () => {
  it("uses supplied values and cannot fall back to shared environment credentials", async () => {
    const oldValue = process.env.UNLISTED_KEY;
    process.env.UNLISTED_KEY = "platform-secret";
    try {
      const provider = new CredentialProvider(createLogger({ silent: true }), {
        suppliedCredentials: { AGENT_KEY: "run-secret", CODEX_AUTH: '{"token":"run-auth"}' },
        ssmEnabled: false,
      });
      await expect(provider.getCredential({ envVar: "AGENT_KEY" })).resolves.toBe("run-secret");
      await expect(provider.getCredential({ envVar: "UNLISTED_KEY" })).resolves.toBeUndefined();
      await expect(provider.getCredential({ envVar: "toString" })).resolves.toBeUndefined();
      await expect(provider.getRawSsmValue(provider.getSharedParameterName("CODEX_AUTH"))).resolves.toBe('{"token":"run-auth"}');
      await expect(provider.getRawSsmValue(provider.getSharedParameterName("UNLISTED_KEY"))).resolves.toBeUndefined();
    } finally {
      if (oldValue === undefined) delete process.env.UNLISTED_KEY;
      else process.env.UNLISTED_KEY = oldValue;
    }
  });
});
