import { jobWorkspaceDir } from "./taskWorkspace";

describe("jobWorkspaceDir", () => {
  it("gives every turn of a task the same folder, so harnesses can resume", () => {
    const first = jobWorkspaceDir("/tmp/w", { id: "job-1", context: { ticketId: "5e742826-8399-44ca-bc50-e8e70b92029e" } });
    const second = jobWorkspaceDir("/tmp/w", { id: "job-2", context: { ticketId: "5e742826-8399-44ca-bc50-e8e70b92029e" } });
    expect(first).toBe("/tmp/w/task-5e742826-8399-44ca-bc50-e8e70b92029e");
    expect(second).toBe(first);
  });

  it("keeps a folder per job when there's no task", () => {
    expect(jobWorkspaceDir("/tmp/w", { id: "job-1" })).toBe("/tmp/w/job-1");
    expect(jobWorkspaceDir("/tmp/w", { id: "job-1", context: { ticketId: "  " } })).toBe("/tmp/w/job-1");
  });

  it("can't be steered out of the workspace root", () => {
    expect(jobWorkspaceDir("/tmp/w", { id: "j", context: { ticketId: "../../etc" } })).toBe("/tmp/w/task-.._.._etc");
    expect(jobWorkspaceDir("/tmp/w", { id: ".." })).toBe("/tmp/w/_");
  });
});
