import { TicketExecutionService } from "../../../services/TicketExecutionService";
import { TicketDAO } from "../../../persistence/ticketing/TicketDAO";
import { ProjectDAO } from "../../../persistence/project/ProjectDAO";
import { ProjectScmConfigDAO } from "../../../persistence/project/ProjectScmConfigDAO";
import { IntegrationCredentialDAO } from "../../../persistence/integrations";
import { ClankerDAO } from "../../../persistence/clanker/ClankerDAO";
import type { ClankerProvisioner } from "../../../provisioning/ClankerProvisioner";
import { getClankerProvisioner } from "../../../provisioning/provisioningFactory";
import { JobService } from "../../../services/JobService";
import { CredentialRequirementsService } from "../../../services/CredentialRequirementsService";
import { WorkerExecutionService } from "../../../workers";
import { TicketMediaExecutionService } from "../../../services/TicketMediaExecutionService";
import { TicketPhaseDocumentService } from "../../../services/TicketPhaseDocumentService";

// Mock dependencies
jest.mock("../../../persistence/ticketing/TicketDAO");
jest.mock("../../../persistence/project/ProjectDAO");
jest.mock("../../../persistence/project/ProjectScmConfigDAO");
jest.mock("../../../persistence/integrations/IntegrationCredentialDAO");
jest.mock("../../../persistence/clanker/ClankerDAO");
jest.mock("../../../provisioning/provisioningFactory", () => ({
  getClankerProvisioner: jest.fn(),
}));
jest.mock("../../../services/JobService");
jest.mock("../../../services/CredentialRequirementsService");
jest.mock("../../../workers/WorkerExecutionService");
jest.mock("../../../services/TicketMediaExecutionService");
jest.mock("../../../services/TicketPhaseDocumentService");

describe("TicketExecutionService", () => {
  let service: TicketExecutionService;
  let mockTicketDAO: jest.Mocked<TicketDAO>;
  let mockProjectDAO: jest.Mocked<ProjectDAO>;
  let mockProjectScmConfigDAO: jest.Mocked<ProjectScmConfigDAO>;
  let mockIntegrationCredentialDAO: jest.Mocked<IntegrationCredentialDAO>;
  let mockClankerDAO: jest.Mocked<ClankerDAO>;
  let mockProvisioningService: jest.Mocked<ClankerProvisioner>;
  let mockJobService: jest.Mocked<JobService>;
  let mockCredentialRequirementsService: jest.Mocked<CredentialRequirementsService>;
  let mockWorkerExecutionService: jest.Mocked<WorkerExecutionService>;
  let mockTicketMediaExecutionService: jest.Mocked<TicketMediaExecutionService>;
  let mockTicketPhaseDocumentService: jest.Mocked<TicketPhaseDocumentService>;

  const mockedGetClankerProvisioner = jest.mocked(getClankerProvisioner);

  beforeEach(() => {
    jest.clearAllMocks();

    mockTicketDAO = new TicketDAO() as jest.Mocked<TicketDAO>;
    mockProjectDAO = new ProjectDAO() as jest.Mocked<ProjectDAO>;
    mockProjectScmConfigDAO =
      new ProjectScmConfigDAO() as jest.Mocked<ProjectScmConfigDAO>;
    mockIntegrationCredentialDAO =
      new IntegrationCredentialDAO() as jest.Mocked<IntegrationCredentialDAO>;
    mockClankerDAO = new ClankerDAO() as jest.Mocked<ClankerDAO>;
    mockProvisioningService = {
      getProvisioningPreflightError: jest.fn(),
      provision: jest.fn(),
      deprovision: jest.fn(),
      resolveAvailabilityStatus: jest.fn(),
    };
    mockJobService = new JobService() as jest.Mocked<JobService>;
    mockCredentialRequirementsService =
      new CredentialRequirementsService() as jest.Mocked<CredentialRequirementsService>;
    mockWorkerExecutionService =
      new WorkerExecutionService() as jest.Mocked<WorkerExecutionService>;
    mockTicketMediaExecutionService =
      new TicketMediaExecutionService() as jest.Mocked<TicketMediaExecutionService>;
    mockTicketPhaseDocumentService =
      new TicketPhaseDocumentService() as jest.Mocked<TicketPhaseDocumentService>;

    (TicketDAO as jest.Mock).mockImplementation(() => mockTicketDAO);
    (ProjectDAO as jest.Mock).mockImplementation(() => mockProjectDAO);
    (ProjectScmConfigDAO as jest.Mock).mockImplementation(
      () => mockProjectScmConfigDAO,
    );
    (IntegrationCredentialDAO as jest.Mock).mockImplementation(
      () => mockIntegrationCredentialDAO,
    );
    (ClankerDAO as jest.Mock).mockImplementation(() => mockClankerDAO);
    mockedGetClankerProvisioner.mockReturnValue(mockProvisioningService);
    (JobService as jest.Mock).mockImplementation(() => mockJobService);
    (CredentialRequirementsService as jest.Mock).mockImplementation(
      () => mockCredentialRequirementsService,
    );
    (WorkerExecutionService as jest.Mock).mockImplementation(
      () => mockWorkerExecutionService,
    );
    (TicketMediaExecutionService as jest.Mock).mockImplementation(
      () => mockTicketMediaExecutionService,
    );
    (TicketPhaseDocumentService as jest.Mock).mockImplementation(
      () => mockTicketPhaseDocumentService,
    );
    mockTicketMediaExecutionService.prepareForExecution.mockResolvedValue({
      media: [],
      mounts: [],
    });
    mockTicketPhaseDocumentService.getOrCreateDocument.mockImplementation(
      async (ticketId, phase) =>
        ({
          id: `${phase}-doc`,
          ticketId,
          phase,
          content:
            phase === "planning" ? "Approved plan" : "Research context",
          approvalState: "approved",
          approvedAt: new Date().toISOString(),
          approvedBy: "approver@example.com",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }) as any,
    );

    service = new TicketExecutionService();
  });

  it("should successfully run a ticket", async () => {
    const ticketId = "ticket-123";
    const clankerId = "clanker-456";
    const projectId = "project-789";

    const mockTicket = {
      id: ticketId,
      projectId,
      title: "Test Ticket",
      description: "Test Description",
    };

    const mockProject = {
      id: projectId,
      name: "Test Project",
      repositoryUrl: "https://github.com/test/repo",
    };

    const mockClanker = {
      id: clankerId,
      status: "active",
      deploymentStrategyId: "strategy-1",
      secretIds: [],
    };

    mockTicketDAO.getTicket.mockResolvedValue(mockTicket as any);
    mockProjectDAO.getProject.mockResolvedValue(mockProject as any);
    mockProjectScmConfigDAO.getByProjectId.mockResolvedValue(null);
    mockIntegrationCredentialDAO.getById.mockResolvedValue(null);
    mockClankerDAO.getClanker.mockResolvedValue(mockClanker as any);
    mockProvisioningService.resolveAvailabilityStatus.mockResolvedValue({
      status: "active",
    } as any);
    mockJobService.submitJob.mockResolvedValue({
      jobId: "job-123",
      status: "active",
      timestamp: new Date().toISOString(),
      callbackToken: "token-123",
    });
    mockCredentialRequirementsService.getRequiredCredentialsForClanker.mockResolvedValue(
      [],
    );
    mockWorkerExecutionService.executeJob.mockResolvedValue({
      success: true,
      executionId: "exec-123",
      attempts: 1,
    });

    const result = await service.runTicket(ticketId, { clankerId });

    expect(result).toEqual({
      jobId: expect.any(String),
      status: "active",
    });

    expect(mockTicketDAO.getTicket).toHaveBeenCalledWith(ticketId);
    expect(mockProjectDAO.getProject).toHaveBeenCalledWith(projectId);
    expect(mockClankerDAO.getClanker).toHaveBeenCalledWith(clankerId);
    expect(mockJobService.submitJob).toHaveBeenCalled();
    expect(mockWorkerExecutionService.executeJob).toHaveBeenCalled();
  });

  it("uses project SCM config repository/base branch and merges SCM secret with clanker secrets", async () => {
    const ticketId = "ticket-123";
    const clankerId = "clanker-456";
    const projectId = "project-789";

    mockTicketDAO.getTicket.mockResolvedValue({
      id: ticketId,
      projectId,
      title: "Test Ticket",
      description: "Test Description",
    } as any);
    mockProjectDAO.getProject.mockResolvedValue({
      id: projectId,
      name: "Test Project",
      repositoryUrl: "https://github.com/fallback/repo",
    } as any);
    mockProjectScmConfigDAO.getByProjectId.mockResolvedValue({
      projectId,
      integrationId: "integration-1",
      integrationSystem: "github",
      sourceRepository: "https://github.com/scm/repo",
      baseBranch: "develop",
      integrationCredentialId: "credential-scm",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    mockIntegrationCredentialDAO.getById.mockResolvedValue({
      id: "credential-scm",
      integrationId: "integration-1",
      name: "GitHub Token",
      credentialType: "token",
      secretId: "secret-scm",
      secretLocation: "env",
      isDefault: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as any);
    mockClankerDAO.getClanker.mockResolvedValue({
      id: clankerId,
      status: "active",
      deploymentStrategyId: "strategy-1",
      secretIds: ["secret-a"],
    } as any);
    mockProvisioningService.resolveAvailabilityStatus.mockResolvedValue({
      status: "active",
    } as any);
    mockJobService.submitJob.mockResolvedValue({
      jobId: "job-123",
      status: "active",
      timestamp: new Date().toISOString(),
      callbackToken: "token-123",
    });
    mockCredentialRequirementsService.getRequiredCredentialsForClanker.mockResolvedValue(
      [],
    );
    mockWorkerExecutionService.executeJob.mockResolvedValue({
      success: true,
      executionId: "exec-123",
      attempts: 1,
    });

    await service.runTicket(ticketId, { clankerId });

    expect(mockJobService.submitJob).toHaveBeenCalledWith(
      expect.objectContaining({
        repository: "https://github.com/scm/repo",
        baseBranch: "develop",
      }),
      expect.any(Object),
    );
    expect(
      mockCredentialRequirementsService.getRequiredCredentialsForClanker,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        secretIds: ["secret-a", "secret-scm"],
      }),
    );
    expect(mockIntegrationCredentialDAO.getById).toHaveBeenCalledWith(
      "credential-scm",
    );
    expect(mockWorkerExecutionService.executeJob).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        id: clankerId,
        secretIds: ["secret-a", "secret-scm"],
      }),
      expect.any(Object),
    );
  });

  it("should throw error if ticket is not found", async () => {
    mockTicketDAO.getTicket.mockResolvedValue(null);

    await expect(
      service.runTicket("non-existent", { clankerId: "123" }),
    ).rejects.toThrow("Ticket not found");
  });

  it("should throw error if clanker is not active", async () => {
    const ticketId = "ticket-123";
    const clankerId = "clanker-456";

    mockTicketDAO.getTicket.mockResolvedValue({
      id: ticketId,
      projectId: "p1",
    } as any);
    mockProjectDAO.getProject.mockResolvedValue({
      id: "p1",
      repositoryUrl: "url",
    } as any);
    mockProjectScmConfigDAO.getByProjectId.mockResolvedValue(null);
    mockIntegrationCredentialDAO.getById.mockResolvedValue(null);
    mockClankerDAO.getClanker.mockResolvedValue({
      id: clankerId,
      status: "inactive",
      deploymentStrategyId: "s1",
    } as any);
    mockProvisioningService.resolveAvailabilityStatus.mockResolvedValue({
      status: "inactive",
    } as any);

    await expect(service.runTicket(ticketId, { clankerId })).rejects.toThrow(
      /Selected clanker is inactive/,
    );
  });

  it("includes prepared ticket media and mounts in job submission context", async () => {
    const ticketId = "ticket-123";
    const clankerId = "clanker-456";
    const projectId = "project-789";

    mockTicketDAO.getTicket.mockResolvedValue({
      id: ticketId,
      projectId,
      title: "Ticket With Media",
      description: "Contains screenshot and recording",
    } as any);
    mockProjectDAO.getProject.mockResolvedValue({
      id: projectId,
      name: "Test Project",
      repositoryUrl: "https://github.com/test/repo",
    } as any);
    mockProjectScmConfigDAO.getByProjectId.mockResolvedValue(null);
    mockIntegrationCredentialDAO.getById.mockResolvedValue(null);
    mockClankerDAO.getClanker.mockResolvedValue({
      id: clankerId,
      status: "active",
      deploymentStrategyId: "strategy-1",
      secretIds: [],
    } as any);
    mockProvisioningService.resolveAvailabilityStatus.mockResolvedValue({
      status: "active",
    } as any);
    mockTicketMediaExecutionService.prepareForExecution.mockResolvedValue({
      media: [
        {
          id: "media-1",
          kind: "screenshot",
          filename: "shot.png",
          mimeType: "image/png",
          size: 1024,
          uploadedAt: new Date().toISOString(),
          storageUrl: "file:///tmp/viberator-ticket-media/screenshots/media-1.png",
          mountPath: "/tmp/viberator-ticket-media/screenshots/media-1.png",
        },
      ],
      mounts: [
        {
          hostPath: "/tmp/viberator-ticket-media/screenshots/media-1.png",
          containerPath: "/tmp/viberator-ticket-media/screenshots/media-1.png",
          readOnly: true,
        },
      ],
    });
    mockJobService.submitJob.mockResolvedValue({
      jobId: "job-123",
      status: "active",
      timestamp: new Date().toISOString(),
      callbackToken: "token-123",
    });
    mockCredentialRequirementsService.getRequiredCredentialsForClanker.mockResolvedValue(
      [],
    );
    mockWorkerExecutionService.executeJob.mockResolvedValue({
      success: true,
      executionId: "exec-123",
      attempts: 1,
    });

    await service.runTicket(ticketId, { clankerId });

    expect(mockJobService.submitJob).toHaveBeenCalledWith(
      expect.objectContaining({
        context: expect.objectContaining({
          researchDocument: "Research context",
          planDocument: "Approved plan",
          ticketMedia: expect.arrayContaining([
            expect.objectContaining({
              id: "media-1",
              kind: "screenshot",
              mountPath: "/tmp/viberator-ticket-media/screenshots/media-1.png",
            }),
          ]),
        }),
        mounts: expect.arrayContaining([
          expect.objectContaining({
            hostPath: "/tmp/viberator-ticket-media/screenshots/media-1.png",
            containerPath: "/tmp/viberator-ticket-media/screenshots/media-1.png",
          }),
        ]),
      }),
      expect.any(Object),
    );
  });

  it("blocks execution when the planning document is not approved", async () => {
    mockTicketDAO.getTicket.mockResolvedValue({
      id: "ticket-999",
      projectId: "p1",
      title: "Blocked Ticket",
      description: "Blocked Description",
    } as any);
    mockTicketPhaseDocumentService.getOrCreateDocument.mockResolvedValueOnce({
      id: "planning-doc",
      ticketId: "ticket-999",
      phase: "planning",
      content: "Draft plan",
      approvalState: "draft",
      approvedAt: null,
      approvedBy: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as any);

    await expect(service.runTicket("ticket-999", { clankerId: "clanker-1" })).rejects.toThrow(
      "Execution is blocked until the planning document is approved",
    );

    expect(mockJobService.submitJob).not.toHaveBeenCalled();
    expect(mockWorkerExecutionService.executeJob).not.toHaveBeenCalled();
  });

  it("includes approved research and planning documents in execution context", async () => {
    const ticketId = "ticket-docs";
    const clankerId = "clanker-docs";
    const projectId = "project-docs";

    mockTicketDAO.getTicket.mockResolvedValue({
      id: ticketId,
      projectId,
      title: "Ticket With Docs",
      description: "Execution uses docs",
    } as any);
    mockTicketPhaseDocumentService.getOrCreateDocument
      .mockResolvedValueOnce({
        id: "planning-doc",
        ticketId,
        phase: "planning",
        content: "Ship the implementation in three steps.",
        approvalState: "approved",
        approvedAt: new Date().toISOString(),
        approvedBy: "approver@example.com",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      } as any)
      .mockResolvedValueOnce({
        id: "research-doc",
        ticketId,
        phase: "research",
        content: "Root cause and relevant code paths.",
        approvalState: "approved",
        approvedAt: new Date().toISOString(),
        approvedBy: "approver@example.com",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      } as any);
    mockProjectDAO.getProject.mockResolvedValue({
      id: projectId,
      name: "Docs Project",
      repositoryUrl: "https://github.com/test/repo",
    } as any);
    mockProjectScmConfigDAO.getByProjectId.mockResolvedValue(null);
    mockClankerDAO.getClanker.mockResolvedValue({
      id: clankerId,
      status: "active",
      deploymentStrategyId: "strategy-1",
      secretIds: [],
    } as any);
    mockProvisioningService.resolveAvailabilityStatus.mockResolvedValue({
      status: "active",
    } as any);
    mockJobService.submitJob.mockResolvedValue({
      jobId: "job-123",
      status: "active",
      timestamp: new Date().toISOString(),
      callbackToken: "token-123",
    });
    mockCredentialRequirementsService.getRequiredCredentialsForClanker.mockResolvedValue(
      [],
    );
    mockWorkerExecutionService.executeJob.mockResolvedValue({
      success: true,
      executionId: "exec-123",
      attempts: 1,
    });

    await service.runTicket(ticketId, { clankerId });

    expect(mockJobService.submitJob).toHaveBeenCalledWith(
      expect.objectContaining({
        context: expect.objectContaining({
          researchDocument: "Root cause and relevant code paths.",
          planDocument: "Ship the implementation in three steps.",
        }),
      }),
      expect.any(Object),
    );
    expect(mockJobService.saveBootstrapPayload).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        context: expect.objectContaining({
          researchDocument: "Root cause and relevant code paths.",
          planDocument: "Ship the implementation in three steps.",
        }),
      }),
    );
  });
});
