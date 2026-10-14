import type { Clanker, Project } from "@viberglass/types";
import type { SpaceFileRun } from "../../../../persistence/spaceFiles/SpaceFilesDAO";
import { submitJobWithBootstrapAndInvoke, type PreparedTicketRunContext } from "../../../../services/ticketRunOrchestration";
import type { ClawJobData } from "../../../../types/Job";

const space: Project = {
  backingKind: "files",
  id: "space-1",
  name: "Reports",
  slug: "reports",
  ticketSystem: "custom",
  credentials: { type: "token" },
  autoFixEnabled: false,
  autoFixTags: [],
  customFieldMappings: {},
  isPrivate: false,
  keyPrefix: "REP",
  defaultReviewerIds: [],
  questionReminderHours: 4,
  createdAt: "",
  updatedAt: "",
};

const runner: Clanker = {
  id: "clanker-1",
  name: "Runner",
  slug: "runner",
  description: null,
  deploymentStrategyId: "docker-id",
  deploymentStrategy: null,
  deploymentConfig: { version: 1, strategy: { type: "docker" }, agent: { type: "claude-code" } },
  configFiles: [],
  agent: "claude-code",
  secretBindings: [],
  mcpServerIds: [],
  skillIds: [],
  status: "active",
  statusMessage: null,
  createdAt: "",
  updatedAt: "",
};

const prepared: PreparedTicketRunContext = {
  project: space,
  scmConfig: null,
  sourceRepository: "",
  baseBranch: "",
  clanker: runner,
  executionClanker: runner,
  scmCredentialSecretId: null,
  workerType: "docker",
  mergedInstructionFiles: [],
  workerInstructionFiles: [],
  mcpServers: [],
  skills: [],
};

const RUN: SpaceFileRun = {
  jobId: "claw_1",
  projectId: "space-1",
  status: "running",
  baseSnapshotId: "snap-1",
  checkpointSnapshotId: "snap-2",
  leaseToken: "1",
};

function job(): ClawJobData {
  return {
    id: "claw_1",
    jobKind: "claw",
    tenantId: "space-1",
    repository: "",
    task: "Write the weekly report",
    context: { clawExecutionId: "exec-1", clawScheduleId: "sched-1", clawTemplateName: "Weekly report" },
    timestamp: 0,
  };
}

function setup(started: SpaceFileRun | null) {
  const deps = {
    jobService: { submitJob: jest.fn().mockResolvedValue({ jobId: "claw_1", callbackToken: "token" }) },
    bootstraps: { saveBootstrapPayload: jest.fn() },
    credentialRequirementsService: { getRequiredCredentialsForClanker: jest.fn().mockResolvedValue([]) },
    workerExecutionService: { executeJob: jest.fn().mockResolvedValue({ executionId: "e-1" }) },
    spaceFiles: {
      enqueue: jest.fn().mockResolvedValue(started),
      payloadFor: jest.fn((run: SpaceFileRun) => ({ spaceId: run.projectId, baseSnapshotId: run.baseSnapshotId, checkpointSnapshotId: run.checkpointSnapshotId })),
    },
  };
  return deps;
}

describe("submitting a scheduled run in a Files space", () => {
  it("gives the worker the space's files instead of a repository when the space is free", async () => {
    const deps = setup(RUN);

    await expect(submitJobWithBootstrapAndInvoke(job(), undefined, "clanker-1", "Claw Task", prepared, deps)).resolves.toMatchObject({ status: "active" });

    expect(deps.spaceFiles.enqueue).toHaveBeenCalledWith("claw_1", "space-1");
    const saved = deps.bootstraps.saveBootstrapPayload.mock.calls.at(-1)?.[1];
    expect(saved).toMatchObject({ jobKind: "claw", files: { spaceId: "space-1", baseSnapshotId: "snap-1", checkpointSnapshotId: "snap-2" } });
    for (const key of ["repository", "branch", "baseBranch", "scm"]) expect(saved).not.toHaveProperty(key);
    expect(deps.workerExecutionService.executeJob).toHaveBeenCalled();
  });

  it("leaves the run queued, without starting its worker, while another run holds the space", async () => {
    const deps = setup(null);

    await expect(submitJobWithBootstrapAndInvoke(job(), undefined, "clanker-1", "Claw Task", prepared, deps)).resolves.toMatchObject({ status: "queued" });

    expect(deps.bootstraps.saveBootstrapPayload).toHaveBeenCalledTimes(1);
    expect(deps.workerExecutionService.executeJob).not.toHaveBeenCalled();
  });

  it("never queues a run in a repository space for its files", async () => {
    const deps = setup(null);

    await submitJobWithBootstrapAndInvoke(job(), undefined, "clanker-1", "Claw Task", { ...prepared, project: { ...space, backingKind: "git" } }, deps);

    expect(deps.spaceFiles.enqueue).not.toHaveBeenCalled();
    expect(deps.workerExecutionService.executeJob).toHaveBeenCalled();
  });
});
