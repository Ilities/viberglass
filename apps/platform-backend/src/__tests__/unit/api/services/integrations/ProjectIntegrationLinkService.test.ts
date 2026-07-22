const mockIntegrationDAO = { getIntegration: jest.fn() };
const mockLinkDAO = {
  isLinked: jest.fn(),
  linkIntegration: jest.fn(),
  getProjectIntegrations: jest.fn(),
  setPrimaryIntegration: jest.fn(),
};
const mockProjectDAO = { updateProject: jest.fn() };

jest.mock("../../../../../persistence/integrations", () => ({
  IntegrationDAO: jest.fn(() => mockIntegrationDAO),
  ProjectIntegrationLinkDAO: jest.fn(() => mockLinkDAO),
}));
jest.mock("../../../../../persistence/project/ProjectDAO", () => ({
  ProjectDAO: jest.fn(() => mockProjectDAO),
}));

import { ProjectIntegrationLinkService } from "../../../../../api/services/integrations/ProjectIntegrationLinkService";

describe("ProjectIntegrationLinkService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockLinkDAO.isLinked.mockResolvedValue(true);
    mockLinkDAO.getProjectIntegrations.mockResolvedValue([
      { integrationId: "shortcut-1", integration: { system: "shortcut" } },
      { integrationId: "jira-1", integration: { system: "jira" } },
      { integrationId: "github-1", integration: { system: "github" } },
    ]);
  });

  it("changes a ticketing primary without resetting the SCM primary", async () => {
    mockIntegrationDAO.getIntegration.mockResolvedValue({
      id: "shortcut-1",
      system: "shortcut",
    });

    await new ProjectIntegrationLinkService().setPrimaryProjectIntegration(
      "project-1",
      "shortcut-1",
    );

    expect(mockLinkDAO.setPrimaryIntegration).toHaveBeenCalledWith(
      "project-1",
      "shortcut-1",
      ["jira-1"],
    );
    expect(mockProjectDAO.updateProject).toHaveBeenCalledWith("project-1", {
      primaryTicketingIntegrationId: "shortcut-1",
    });
    expect(mockProjectDAO.updateProject).not.toHaveBeenCalledWith(
      "project-1",
      expect.objectContaining({ primaryScmIntegrationId: expect.anything() }),
    );
  });

  it("rejects an inbound webhook integration as a primary", async () => {
    mockIntegrationDAO.getIntegration.mockResolvedValue({
      id: "custom-1",
      system: "custom",
    });

    await expect(
      new ProjectIntegrationLinkService().setPrimaryProjectIntegration(
        "project-1",
        "custom-1",
      ),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(mockProjectDAO.updateProject).not.toHaveBeenCalled();
  });
});
