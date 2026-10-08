import { TaskCodeBranchService } from "../../../../services/tasks/TaskCodeBranchService";

function setup(options: { pushed?: string | null; scm?: boolean; next?: number } = {}) {
  const deps = {
    tickets: { getTicket: jest.fn().mockResolvedValue({ id: "t-1", projectId: "p-1", externalTicketId: "" }) },
    scm: {
      getByProjectId: jest.fn().mockResolvedValue(
        options.scm === false ? null : { sourceRepository: " https://github.com/acme/web ", baseBranch: "develop", branchNameTemplate: null },
      ),
    },
    takeovers: { get: jest.fn().mockResolvedValue(null), lastBuildBranch: jest.fn().mockResolvedValue(options.pushed ?? null) },
    namer: { current: jest.fn().mockResolvedValue("viberglass/t-1"), preview: jest.fn().mockResolvedValue("viberglass/t-1") },
    parts: { state: jest.fn().mockResolvedValue({ parts: [], open: null, addable: null, next: options.next ?? null }) },
  };
  return { deps, service: new TaskCodeBranchService(deps) };
}

describe("TaskCodeBranchService", () => {
  it("describes the task's branch, its repository, and whether a build pushed it", async () => {
    const { deps, service } = setup({ pushed: "viberglass/t-1" });
    expect(await service.describe("t-1")).toEqual({
      branch: "viberglass/t-1",
      repositoryUrl: "https://github.com/acme/web",
      baseBranch: "develop",
      pushed: true,
      takenOver: null,
    });
    expect(deps.namer.preview).toHaveBeenCalledWith("t-1", "t-1");
    expect(deps.namer.current).not.toHaveBeenCalled();
  });

  it("names the branch when claimed, for the parts left to build", async () => {
    const { deps, service } = setup({ next: 2 });
    expect(await service.describe("t-1", { claim: true })).toMatchObject({ branch: "viberglass/t-1" });
    expect(deps.namer.current).toHaveBeenCalledWith("t-1", "t-1", { first: 2, last: null });
  });

  it("says a branch no build has pushed starts from the base branch", async () => {
    expect(await setup().service.describe("t-1")).toMatchObject({ branch: "viberglass/t-1", pushed: false });
  });

  it("has nothing to say for a space without a repository", async () => {
    expect(await setup({ scm: false }).service.describe("t-1")).toBeNull();
  });
});
