import type { TaskTurnAction, Ticket } from "@viberglass/types";
import type { AgentSession } from "../../../../persistence/agentSession/AgentSessionDAO";
import { TaskTurnJobDispatcher, type DispatchTurnInput } from "../../../../services/taskTurns/TaskTurnJobDispatcher";
import { prepareTicketRunContext, buildBootstrapPayload } from "../../../../services/ticketRunOrchestration";

jest.mock("../../../../services/ticketRunOrchestration", () => ({
  prepareTicketRunContext: jest.fn().mockResolvedValue({
    sourceRepository: "https://github.com/acme/app",
    baseBranch: "main",
    executionClanker: { id: "c-1", agent: "fake" },
    project: { id: "p-1" },
    mergedInstructionFiles: [],
    workerInstructionFiles: [],
    mcpServers: [],
    skills: [],
    workerType: "docker",
  }),
  buildScmPayloadFromContext: jest.fn().mockReturnValue(null),
  buildBootstrapPayload: jest.fn().mockReturnValue({}),
}));
jest.mock("../../../../provisioning/provisioningFactory", () => ({ getClankerProvisioner: jest.fn() }));

function setup() {
  const jobs = { submitJob: jest.fn().mockResolvedValue({ jobId: "job", callbackToken: "token" }), updateJobStatus: jest.fn() };
  const bootstraps = { saveBootstrapPayload: jest.fn() };
  const credentials = { getRequiredCredentialsForClanker: jest.fn().mockResolvedValue([]) };
  const workers = { executeJob: jest.fn().mockResolvedValue({ executionId: "e-1" }) };
  const media = { prepareForExecution: jest.fn().mockResolvedValue({ mounts: [], media: [] }) };
  const branches = { nameFor: jest.fn().mockResolvedValue("viberglass/t-1-part-2"), existing: jest.fn().mockResolvedValue("viberglass/t-1") };
  const spaceFiles = {
    enqueue: jest.fn().mockResolvedValue(null),
    payloadFor: jest.fn((run: { projectId: string; baseSnapshotId: string | null; checkpointSnapshotId: string }) => ({
      spaceId: run.projectId,
      baseSnapshotId: run.baseSnapshotId,
      checkpointSnapshotId: run.checkpointSnapshotId,
    })),
  };
  const launches = { getQueued: jest.fn() };
  const tickets = { getTicket: jest.fn().mockResolvedValue(TICKET) };
  const dispatcher = new TaskTurnJobDispatcher(jobs, bootstraps, credentials, workers, media, branches, spaceFiles, launches, tickets, jobs);
  return { dispatcher, bootstraps, branches, workers, spaceFiles, launches, jobs };
}

const SESSION: AgentSession = {
  id: "s-1",
  tenantId: "api-server",
  projectId: "p-1",
  projectSlug: null,
  ticketId: "t-1",
  ticketTitle: null,
  clankerId: "c-1",
  mode: "planning",
  status: "active",
  title: null,
  repository: "acme/app",
  baseBranch: "main",
  workspaceBranch: null,
  draftPullRequestUrl: null,
  headCommitHash: null,
  lastJobId: null,
  lastTurnId: null,
  latestPendingRequestId: null,
  metadataJson: null,
  createdBy: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  completedAt: null,
};

const TICKET: Ticket = {
  id: "t-1",
  key: "ES-1",
  projectId: "p-1",
  timestamp: "2026-10-06T10:00:00Z",
  title: "Gift note",
  description: "Let people add a note",
  severity: "medium",
  category: "General",
  status: "open",
  workflowPhase: "planning",
  metadata: { browser: { name: "x", version: "1" }, os: { name: "x", version: "1" }, screen: { width: 1, height: 1, viewportWidth: 1, viewportHeight: 1, pixelRatio: 1 }, network: { userAgent: "x", language: "en", cookiesEnabled: true, onLine: true }, console: [], errors: [], pageUrl: "x", timestamp: "x", timezone: "UTC" },
  annotations: [],
  ticketSystem: "native",
  autoFixRequested: false,
  createdAt: "2026-10-06T10:00:00Z",
  updatedAt: "2026-10-06T10:00:00Z",
};

function input(action: TaskTurnAction, overrides: Partial<DispatchTurnInput> = {}): DispatchTurnInput {
  return {
    session: SESSION,
    turnId: "turn-1",
    action,
    allowCode: action === "code",
    prompts: { prompt: "delta", coldStartPrompt: "cold" },
    ticket: TICKET,
    documents: { plan: "" },
    summary: "",
    lastAgentCommit: null,
    ...overrides,
  };
}

describe("TaskTurnJobDispatcher's branch", () => {
  it("names a build's branch for the parts it builds", async () => {
    const { dispatcher, bootstraps, branches } = setup();

    await dispatcher.dispatch(input("code", { buildParts: { first: 2, last: 2 } }), jest.fn());

    expect(branches.nameFor).toHaveBeenCalledWith("t-1", expect.any(String), { first: 2, last: 2 });
    expect(bootstraps.saveBootstrapPayload).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ taskBranch: "viberglass/t-1-part-2" }));
  });

  it("continues the open pull request's branch for a build of no new parts", async () => {
    const { dispatcher, branches } = setup();

    await dispatcher.dispatch(input("code", { buildParts: null }), jest.fn());

    expect(branches.nameFor).toHaveBeenCalledWith("t-1", expect.any(String), null);
  });

  it.each(["plan", "reply", "summarise"] as const)("reads the latest branch for a %s turn and never names one", async (action) => {
    const { dispatcher, bootstraps, branches } = setup();

    await dispatcher.dispatch(input(action), jest.fn());

    expect(branches.nameFor).not.toHaveBeenCalled();
    expect(bootstraps.saveBootstrapPayload).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ taskBranch: "viberglass/t-1" }));
  });
});

describe("TaskTurnJobDispatcher in a Files space", () => {
  const RUN = { jobId: "job", projectId: "p-1", status: "running" as const, baseSnapshotId: "snap-1", checkpointSnapshotId: "snap-2", leaseToken: "4" };

  beforeEach(() => {
    jest.mocked(prepareTicketRunContext).mockResolvedValueOnce({
      sourceRepository: "",
      baseBranch: "",
      executionClanker: { id: "c-1", agent: "fake" },
      project: { id: "p-1", backingKind: "files" },
      mergedInstructionFiles: [],
      workerInstructionFiles: [],
      mcpServers: [],
      skills: [],
      workerType: "docker",
    } as never);
    jest.mocked(buildBootstrapPayload).mockReturnValueOnce({ repository: "", baseBranch: "", scm: null, task: "delta" });
  });

  it("sends the space's files instead of a repository, and starts at once when the space is free", async () => {
    const { dispatcher, bootstraps, branches, workers, spaceFiles } = setup();
    spaceFiles.enqueue.mockResolvedValue(RUN);

    await expect(dispatcher.dispatch(input("reply"), jest.fn())).resolves.toMatchObject({ status: "pending" });

    const saved = bootstraps.saveBootstrapPayload.mock.calls.at(-1)?.[1];
    expect(saved).toMatchObject({ files: { spaceId: "p-1", baseSnapshotId: "snap-1", checkpointSnapshotId: "snap-2" } });
    for (const key of ["repository", "baseBranch", "scm", "taskBranch", "lastAgentCommit"]) expect(saved).not.toHaveProperty(key);
    expect(branches.existing).not.toHaveBeenCalled();
    expect(workers.executeJob).toHaveBeenCalled();
  });

  it("leaves the job queued while another run holds the space", async () => {
    const { dispatcher, workers } = setup();

    await expect(dispatcher.dispatch(input("reply"), jest.fn())).resolves.toMatchObject({ status: "queued" });

    expect(workers.executeJob).not.toHaveBeenCalled();
  });

  it("starts a waiting run later from what was saved for it", async () => {
    const { dispatcher, bootstraps, workers, launches } = setup();
    launches.getQueued.mockResolvedValue({
      id: "job", tenantId: "api-server", jobKind: "reply", task: "delta", ticketId: "t-1", clankerId: "c-1",
      callbackToken: "token", context: {}, settings: {}, bootstrapPayload: { agentSessionId: "s-1", task: "delta" },
    });

    await dispatcher.launchWaiting(RUN);

    expect(bootstraps.saveBootstrapPayload).toHaveBeenCalledWith("job", expect.objectContaining({ agentSessionId: "s-1", files: expect.objectContaining({ checkpointSnapshotId: "snap-2" }) }));
    expect(workers.executeJob).toHaveBeenCalledWith(expect.objectContaining({ id: "job", callbackToken: "token" }), expect.anything(), expect.anything());
  });

  it("fails a waiting run that can no longer start", async () => {
    const { dispatcher, workers, launches, jobs } = setup();
    jest.mocked(prepareTicketRunContext).mockReset().mockRejectedValueOnce(new Error("The runner is stopped"));
    launches.getQueued.mockResolvedValue({
      id: "job", tenantId: "api-server", jobKind: "reply", task: "delta", ticketId: "t-1", clankerId: "c-1",
      callbackToken: "token", context: {}, settings: {}, bootstrapPayload: {},
    });

    await expect(dispatcher.launchWaiting(RUN)).rejects.toThrow("The runner is stopped");

    expect(jobs.updateJobStatus).toHaveBeenCalledWith("job", "failed", expect.objectContaining({ failureCode: "RUNNER_UNAVAILABLE" }));
    expect(workers.executeJob).not.toHaveBeenCalled();
  });
});
