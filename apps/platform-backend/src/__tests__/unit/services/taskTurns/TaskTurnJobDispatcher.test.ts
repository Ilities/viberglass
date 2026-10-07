import type { TaskTurnAction, Ticket } from "@viberglass/types";
import type { AgentSession } from "../../../../persistence/agentSession/AgentSessionDAO";
import { TaskTurnJobDispatcher, type DispatchTurnInput } from "../../../../services/taskTurns/TaskTurnJobDispatcher";

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
  const jobs = { submitJob: jest.fn().mockResolvedValue({ jobId: "job", callbackToken: "token" }) };
  const bootstraps = { saveBootstrapPayload: jest.fn() };
  const credentials = { getRequiredCredentialsForClanker: jest.fn().mockResolvedValue([]) };
  const workers = { executeJob: jest.fn().mockResolvedValue({ executionId: "e-1" }) };
  const media = { prepareForExecution: jest.fn().mockResolvedValue({ mounts: [], media: [] }) };
  const branches = { nameFor: jest.fn().mockResolvedValue("viberglass/t-1-part-2"), existing: jest.fn().mockResolvedValue("viberglass/t-1") };
  const dispatcher = new TaskTurnJobDispatcher(jobs, bootstraps, credentials, workers, media, branches);
  return { dispatcher, bootstraps, branches };
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

    expect(branches.nameFor).toHaveBeenCalledWith("t-1", expect.any(String), undefined);
  });

  it.each(["plan", "reply", "summarise"] as const)("reads the latest branch for a %s turn and never names one", async (action) => {
    const { dispatcher, bootstraps, branches } = setup();

    await dispatcher.dispatch(input(action), jest.fn());

    expect(branches.nameFor).not.toHaveBeenCalled();
    expect(bootstraps.saveBootstrapPayload).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ taskBranch: "viberglass/t-1" }));
  });
});
