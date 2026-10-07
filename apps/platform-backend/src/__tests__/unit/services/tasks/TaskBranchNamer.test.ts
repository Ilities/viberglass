import { TaskBranchNamer } from "../../../../services/tasks/TaskBranchNamer";

function setup(stored: string | null, template: string | null = null) {
  const deps = {
    // The DAO keeps the open pull request's branch, else names a new one.
    branches: { get: jest.fn().mockResolvedValue(stored), claim: jest.fn(async (_id: string, name: string) => stored ?? name) },
    tickets: { getTicket: jest.fn().mockResolvedValue({ id: "t-1", projectId: "p-1", externalTicketId: "WEB-1" }) },
    scm: { getByProjectId: jest.fn().mockResolvedValue({ branchNameTemplate: template }) },
    sessions: { getLatestClankerIdByTicket: jest.fn().mockResolvedValue("claude") },
  };
  return { deps, namer: new TaskBranchNamer(deps) };
}

describe("TaskBranchNamer", () => {
  it("keeps the branch of the pull request a build continues", async () => {
    const { namer } = setup("feature/first-job");
    expect(await namer.nameFor("t-1", "job-2")).toBe("feature/first-job");
  });

  it("names it from the template the first time, with the run that first needs it, for the whole plan", async () => {
    const { deps, namer } = setup(null, "feature/{{ jobId }}");
    expect(await namer.nameFor("t-1", "job-1")).toBe("feature/job-1");
    expect(deps.branches.claim).toHaveBeenCalledWith("t-1", "feature/job-1", { first: 1, last: null });
  });

  it("uses the default name without a template", async () => {
    expect(await setup(null).namer.nameFor("t-1", "job-1")).toBe("viberglass/t-1");
  });

  it("names a later part's branch after the first's, with its part", async () => {
    const { deps, namer } = setup(null);
    expect(await namer.nameFor("t-1", "job-3", { first: 2, last: 2 })).toBe("viberglass/t-1-part-2");
    expect(deps.branches.claim).toHaveBeenCalledWith("t-1", "viberglass/t-1-part-2", { first: 2, last: 2 });
  });

  it("reads the latest branch without naming one, and names one for a take-over only when there's none", async () => {
    const stored = setup("viberglass/t-1");
    expect(await stored.namer.existing("t-1")).toBe("viberglass/t-1");
    expect(await stored.namer.current("t-1", "t-1")).toBe("viberglass/t-1");
    expect(stored.deps.branches.claim).not.toHaveBeenCalled();

    const none = setup(null);
    expect(await none.namer.current("t-1", "t-1")).toBe("viberglass/t-1");
    expect(none.deps.branches.claim).toHaveBeenCalled();
  });
});
