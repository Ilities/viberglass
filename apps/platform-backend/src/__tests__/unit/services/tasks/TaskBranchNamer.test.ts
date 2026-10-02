import { TaskBranchNamer } from "../../../../services/tasks/TaskBranchNamer";

function setup(stored: string | null, template: string | null = null) {
  const deps = {
    branches: { get: jest.fn().mockResolvedValue(stored), claim: jest.fn(async (_id: string, name: string) => name) },
    tickets: { getTicket: jest.fn().mockResolvedValue({ id: "t-1", projectId: "p-1", externalTicketId: "WEB-1" }) },
    scm: { getByProjectId: jest.fn().mockResolvedValue({ branchNameTemplate: template }) },
    sessions: { getLatestClankerIdByTicket: jest.fn().mockResolvedValue("claude") },
  };
  return { deps, namer: new TaskBranchNamer(deps) };
}

describe("TaskBranchNamer", () => {
  it("keeps the name the task's branch was given", async () => {
    const { deps, namer } = setup("feature/first-job");
    expect(await namer.nameFor("t-1", "job-2")).toBe("feature/first-job");
    expect(deps.branches.claim).not.toHaveBeenCalled();
  });

  it("names it from the template the first time, with the run that first needs it", async () => {
    const { deps, namer } = setup(null, "feature/{{ jobId }}");
    expect(await namer.nameFor("t-1", "job-1")).toBe("feature/job-1");
    expect(deps.branches.claim).toHaveBeenCalledWith("t-1", "feature/job-1");
  });

  it("uses the default name without a template", async () => {
    expect(await setup(null).namer.nameFor("t-1", "job-1")).toBe("viberator/t-1");
  });
});
