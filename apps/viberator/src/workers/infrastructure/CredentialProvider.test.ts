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
