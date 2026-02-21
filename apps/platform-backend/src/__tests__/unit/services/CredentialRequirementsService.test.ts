import type { Clanker } from "@viberglass/types";
import { CredentialRequirementsService } from "../../../services/CredentialRequirementsService";
import { SecretResolutionService } from "../../../services/SecretResolutionService";

jest.mock("../../../services/SecretResolutionService");

function createClanker(overrides: Partial<Clanker> = {}): Clanker {
  return {
    id: "clanker-1",
    name: "Test Clanker",
    slug: "test-clanker",
    description: null,
    deploymentStrategyId: "strategy-1",
    deploymentStrategy: null,
    deploymentConfig: null,
    configFiles: [],
    agent: "claude-code",
    secretIds: [],
    status: "active",
    statusMessage: null,
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("CredentialRequirementsService", () => {
  let service: CredentialRequirementsService;
  let mockSecretResolutionService: jest.Mocked<SecretResolutionService>;

  beforeEach(() => {
    jest.clearAllMocks();

    mockSecretResolutionService = jest.mocked(new SecretResolutionService());
    jest.mocked(SecretResolutionService).mockImplementation(
      () => mockSecretResolutionService,
    );

    service = new CredentialRequirementsService();
  });

  it("returns credential names derived from clanker secret IDs", async () => {
    const timestamp = new Date("2024-01-01T00:00:00.000Z");
    mockSecretResolutionService.getSecretMetadataForClanker.mockResolvedValue([
      {
        id: "secret-a",
        name: "GITHUB_TOKEN",
        secretLocation: "env",
        secretPath: null,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      {
        id: "secret-b",
        name: "OPENAI_API_KEY",
        secretLocation: "env",
        secretPath: null,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ]);

    const clanker = createClanker({ secretIds: ["secret-a", "secret-b"] });

    const requiredCredentials =
      await service.getRequiredCredentialsForClanker(clanker);

    expect(
      mockSecretResolutionService.getSecretMetadataForClanker,
    ).toHaveBeenCalledWith(["secret-a", "secret-b"]);
    expect(requiredCredentials).toEqual(["GITHUB_TOKEN", "OPENAI_API_KEY"]);
  });

  it("adds codex device auth secret when codex auth mode is chatgpt_device", async () => {
    const timestamp = new Date("2024-01-01T00:00:00.000Z");
    mockSecretResolutionService.getSecretMetadataForClanker.mockResolvedValue([
      {
        id: "secret-a",
        name: "CODEX_AUTH_JSON",
        secretLocation: "env",
        secretPath: null,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ]);

    const clanker = createClanker({
      agent: "codex",
      deploymentConfig: {
        version: 1,
        strategy: {
          type: "docker",
        },
        agent: {
          type: "codex",
          codexAuth: {
            mode: "chatgpt_device",
            secretName: "CODEX_AUTH_JSON",
          },
        },
      },
      secretIds: ["secret-a"],
    });

    const requiredCredentials =
      await service.getRequiredCredentialsForClanker(clanker);

    expect(requiredCredentials).toEqual(["CODEX_AUTH_JSON"]);
  });

  it("does not add codex device auth secret when mode is api_key", async () => {
    mockSecretResolutionService.getSecretMetadataForClanker.mockResolvedValue([]);

    const clanker = createClanker({
      agent: "codex",
      deploymentConfig: {
        version: 1,
        strategy: {
          type: "docker",
        },
        agent: {
          type: "codex",
          codexAuth: {
            mode: "api_key",
            secretName: "CODEX_AUTH_JSON",
          },
        },
      },
      secretIds: [],
    });

    const requiredCredentials =
      await service.getRequiredCredentialsForClanker(clanker);

    expect(requiredCredentials).toEqual([]);
  });
});
