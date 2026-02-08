import { TicketExecutionService } from "../../../services/TicketExecutionService";
import { TicketDAO } from "../../../persistence/ticketing/TicketDAO";
import { ProjectDAO } from "../../../persistence/project/ProjectDAO";
import { ClankerDAO } from "../../../persistence/clanker/ClankerDAO";
import { ClankerProvisioningService } from "../../../services/ClankerProvisioningService";
import { JobService } from "../../../services/JobService";
import { SecretResolutionService } from "../../../services/SecretResolutionService";
import { WorkerExecutionService } from "../../../workers";

// Mock dependencies
jest.mock("../../../persistence/ticketing/TicketDAO");
jest.mock("../../../persistence/project/ProjectDAO");
jest.mock("../../../persistence/clanker/ClankerDAO");
jest.mock("../../../services/ClankerProvisioningService");
jest.mock("../../../services/JobService");
jest.mock("../../../services/SecretResolutionService");
jest.mock("../../../workers/WorkerExecutionService");

describe("TicketExecutionService", () => {
  let service: TicketExecutionService;
  let mockTicketDAO: jest.Mocked<TicketDAO>;
  let mockProjectDAO: jest.Mocked<ProjectDAO>;
  let mockClankerDAO: jest.Mocked<ClankerDAO>;
  let mockProvisioningService: jest.Mocked<ClankerProvisioningService>;
  let mockJobService: jest.Mocked<JobService>;
  let mockSecretResolutionService: jest.Mocked<SecretResolutionService>;
  let mockWorkerExecutionService: jest.Mocked<WorkerExecutionService>;

  beforeEach(() => {
    jest.clearAllMocks();

    mockTicketDAO = new TicketDAO() as jest.Mocked<TicketDAO>;
    mockProjectDAO = new ProjectDAO() as jest.Mocked<ProjectDAO>;
    mockClankerDAO = new ClankerDAO() as jest.Mocked<ClankerDAO>;
    mockProvisioningService =
      new ClankerProvisioningService() as jest.Mocked<ClankerProvisioningService>;
    mockJobService = new JobService() as jest.Mocked<JobService>;
    mockSecretResolutionService =
      new SecretResolutionService() as jest.Mocked<SecretResolutionService>;
    mockWorkerExecutionService =
      new WorkerExecutionService() as jest.Mocked<WorkerExecutionService>;

    (TicketDAO as jest.Mock).mockImplementation(() => mockTicketDAO);
    (ProjectDAO as jest.Mock).mockImplementation(() => mockProjectDAO);
    (ClankerDAO as jest.Mock).mockImplementation(() => mockClankerDAO);
    (ClankerProvisioningService as jest.Mock).mockImplementation(
      () => mockProvisioningService,
    );
    (JobService as jest.Mock).mockImplementation(() => mockJobService);
    (SecretResolutionService as jest.Mock).mockImplementation(
      () => mockSecretResolutionService,
    );
    (WorkerExecutionService as jest.Mock).mockImplementation(
      () => mockWorkerExecutionService,
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
    mockSecretResolutionService.getSecretMetadataForClanker.mockResolvedValue(
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
});
