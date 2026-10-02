import { TaskCodeBranchService } from "../../../../services/tasks/TaskCodeBranchService";

function setup(options: { pushed?: string | null; scm?: boolean; template?: string | null } = {}) {
  const deps = {
    tickets: { getTicket: jest.fn().mockResolvedValue({ id: "t-1", projectId: "p-1", externalTicketId: "" }) },
    scm: {
      getByProjectId: jest.fn().mockResolvedValue(
        options.scm === false
          ? null
          : { sourceRepository: " https://github.com/acme/web ", baseBranch: "develop", branchNameTemplate: options.template ?? null },
      ),
    },
    takeovers: { get: jest.fn().mockResolvedValue(null), lastBuildBranch: jest.fn().mockResolvedValue(options.pushed ?? null) },
    sessions: { getLatestClankerIdByTicket: jest.fn().mockResolvedValue("claude") },
  };
  return { deps, service: new TaskCodeBranchService(deps) };
}

describe("TaskCodeBranchService", () => {
  it("names the branch a build pushed", async () => {
    expect(await setup({ pushed: "viberator/t-1-custom" }).service.describe("t-1")).toEqual({
      branch: "viberator/t-1-custom",
      repositoryUrl: "https://github.com/acme/web",
      baseBranch: "develop",
      pushed: true,
      takenOver: null,
    });
  });

  it("names the branch the next build would use, before any has pushed", async () => {
    expect(await setup().service.describe("t-1")).toMatchObject({ branch: "viberator/t-1", pushed: false });
    expect((await setup({ template: "feature/{{ ticketId }}-{{ clanker }}" }).service.describe("t-1"))?.branch).toBe("feature/t-1-claude");
  });

  it("has nothing to say for a space without a repository", async () => {
    expect(await setup({ scm: false }).service.describe("t-1")).toBeNull();
  });
});
