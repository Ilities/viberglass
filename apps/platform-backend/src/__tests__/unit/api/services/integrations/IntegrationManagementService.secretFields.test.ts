const mockIntegrationDAO = { getIntegration: jest.fn(), createIntegration: jest.fn(), updateIntegration: jest.fn(), deleteIntegration: jest.fn() };
const mockUsageDAO = { listProjectsUsing: jest.fn().mockResolvedValue([]) };

jest.mock("../../../../../persistence/integrations", () => ({
  IntegrationDAO: jest.fn(() => mockIntegrationDAO),
  ProjectIntegrationLinkDAO: jest.fn(() => ({ deleteAllLinksForIntegration: jest.fn() })),
  IntegrationCredentialDAO: jest.fn(() => ({ deleteAllForIntegration: jest.fn() })),
  IntegrationUsageDAO: jest.fn(() => mockUsageDAO),
}));
jest.mock("../../../../../persistence/webhook/WebhookConfigDAO", () => ({
  WebhookConfigDAO: jest.fn(() => ({ deleteAllForIntegration: jest.fn() })),
}));
jest.mock("../../../../../services/SecretService", () => ({ SecretService: jest.fn(() => ({})) }));
jest.mock("../../../../../integrations/registerIntegrationPlugins", () => ({
  integrationRegistry: {
    get: jest.fn(() => ({
      id: "chat-app",
      status: "ready",
      configFields: [
        { key: "workspace", label: "Workspace", type: "string" },
        { key: "botToken", label: "Bot token", type: "secret" },
      ],
    })),
  },
}));

import { IntegrationManagementService } from "../../../../../api/services/integrations/IntegrationManagementService";
import { ConnectionSecretFields } from "../../../../../api/services/integrations/ConnectionSecretFields";

const CONNECTION = { id: "conn-1", name: "Chat", system: "chat-app", config: {}, isActive: true, createdAt: "", updatedAt: "" };

function service() {
  const real = new ConnectionSecretFields(
    { listByIntegrationId: jest.fn(), create: jest.fn(), delete: jest.fn() },
    { createSecret: jest.fn(), updateSecret: jest.fn(), deleteSecret: jest.fn() },
  );
  const secretFields = {
    split: jest.fn(real.split.bind(real)),
    save: jest.fn().mockResolvedValue(undefined),
    removeAll: jest.fn().mockResolvedValue(undefined),
  };
  const onChanged = jest.fn().mockResolvedValue(undefined);
  const management = new IntegrationManagementService(undefined, undefined, undefined, undefined, undefined, undefined, secretFields, onChanged);
  return { management, secretFields, onChanged };
}

describe("IntegrationManagementService secret fields", () => {
  beforeEach(() => jest.clearAllMocks());

  it("stores secret values apart from the config of a new connection, then announces it", async () => {
    mockIntegrationDAO.createIntegration.mockResolvedValue(CONNECTION);
    const { management, secretFields, onChanged } = service();
    await management.createIntegration({ name: "Chat", system: "chat-app", config: { workspace: "acme", botToken: "xoxb-1" } });

    expect(mockIntegrationDAO.createIntegration).toHaveBeenCalledWith({ name: "Chat", system: "chat-app", config: { workspace: "acme" } });
    expect(secretFields.save).toHaveBeenCalledWith(CONNECTION, [{ field: expect.objectContaining({ key: "botToken" }), value: "xoxb-1" }]);
    expect(onChanged).toHaveBeenCalledWith("chat-app");
  });

  it("never writes a secret field into the config on save, and announces the change", async () => {
    mockIntegrationDAO.getIntegration.mockResolvedValue(CONNECTION);
    mockIntegrationDAO.updateIntegration.mockResolvedValue(CONNECTION);
    const { management, secretFields, onChanged } = service();
    await management.updateIntegration("conn-1", { config: { workspace: "acme", botToken: "" } });

    expect(mockIntegrationDAO.updateIntegration).toHaveBeenCalledWith("conn-1", { name: undefined, config: { workspace: "acme" }, isActive: undefined });
    expect(secretFields.save).toHaveBeenCalledWith(CONNECTION, []);
    expect(onChanged).toHaveBeenCalledWith("chat-app");
  });

  it("removes the secret values with the connection, then announces it", async () => {
    mockIntegrationDAO.getIntegration.mockResolvedValue(CONNECTION);
    const { management, secretFields, onChanged } = service();
    await management.deleteIntegration("conn-1");

    expect(secretFields.removeAll).toHaveBeenCalledWith("conn-1");
    expect(mockIntegrationDAO.deleteIntegration).toHaveBeenCalledWith("conn-1", true);
    expect(onChanged).toHaveBeenCalledWith("chat-app");
  });
});
