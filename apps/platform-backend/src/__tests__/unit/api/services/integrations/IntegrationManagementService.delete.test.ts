const mockIntegrationDAO = { getIntegration: jest.fn(), deleteIntegration: jest.fn() };
const mockProjectLinkDAO = { deleteAllLinksForIntegration: jest.fn() };
const mockWebhookConfigDAO = { deleteAllForIntegration: jest.fn() };
const mockCredentialDAO = { deleteAllForIntegration: jest.fn() };
const mockUsageDAO = { listProjectsUsing: jest.fn() };

jest.mock("../../../../../persistence/integrations", () => ({
  IntegrationDAO: jest.fn(() => mockIntegrationDAO),
  ProjectIntegrationLinkDAO: jest.fn(() => mockProjectLinkDAO),
  IntegrationCredentialDAO: jest.fn(() => mockCredentialDAO),
  IntegrationUsageDAO: jest.fn(() => mockUsageDAO),
}));
jest.mock("../../../../../persistence/webhook/WebhookConfigDAO", () => ({
  WebhookConfigDAO: jest.fn(() => mockWebhookConfigDAO),
}));
jest.mock("../../../../../services/SecretService", () => ({
  SecretService: jest.fn(() => ({})),
}));
jest.mock("../../../../../integrations/registerIntegrationPlugins", () => ({
  integrationRegistry: { get: jest.fn() },
}));

import { IntegrationManagementService } from "../../../../../api/services/integrations/IntegrationManagementService";

describe("IntegrationManagementService.deleteIntegration", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIntegrationDAO.getIntegration.mockResolvedValue({ id: "int-1", system: "github" });
  });

  it("refuses to delete an integration that projects still use", async () => {
    mockUsageDAO.listProjectsUsing.mockResolvedValue([
      { projectId: "p-1", projectName: "UX Walkthrough" },
      { projectId: "p-2", projectName: "Live Verification Project" },
    ]);

    await expect(new IntegrationManagementService().deleteIntegration("int-1")).rejects.toMatchObject({
      statusCode: 409,
      message:
        "This integration is used by UX Walkthrough, Live Verification Project. Remove it from those projects first.",
    });
    expect(mockCredentialDAO.deleteAllForIntegration).not.toHaveBeenCalled();
    expect(mockIntegrationDAO.deleteIntegration).not.toHaveBeenCalled();
  });

  it("deletes an unused integration and its credentials and webhooks", async () => {
    mockUsageDAO.listProjectsUsing.mockResolvedValue([]);

    await new IntegrationManagementService().deleteIntegration("int-1");

    expect(mockWebhookConfigDAO.deleteAllForIntegration).toHaveBeenCalledWith("int-1");
    expect(mockCredentialDAO.deleteAllForIntegration).toHaveBeenCalledWith("int-1");
    expect(mockIntegrationDAO.deleteIntegration).toHaveBeenCalledWith("int-1", true);
  });
});
