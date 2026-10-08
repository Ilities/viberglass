import { TaskCopyService } from "../../../../services/tasks/TaskCopyService";

const ORIGINAL = { id: "task-1", projectId: "web", title: "Gift notes", description: "Let customers add a note.", severity: "medium", category: "jira" };
const VIEWER = { id: "user-1", role: "admin" as const };

function setup() {
  const deps = {
    tickets: {
      getTicket: jest.fn().mockResolvedValue(ORIGINAL),
      createTicket: jest.fn().mockResolvedValue({ id: "task-2" }),
      getSummary: jest.fn().mockImplementation(async (id: string) =>
        id === "task-1"
          ? { title: "Gift notes", key: "WEB-1", spaceSlug: "web", spaceName: "Web shop", pullRequestUrl: null }
          : { title: "Gift notes", key: "API-4", spaceSlug: "api", spaceName: "API", pullRequestUrl: null },
      ),
    },
    spaceAccess: { assertCanSee: jest.fn().mockResolvedValue({ projectId: "api", membership: null }) },
    discussion: { create: jest.fn().mockResolvedValue("message-1") },
  };
  return { deps, copies: new TaskCopyService(deps) };
}

describe("TaskCopyService", () => {
  it("creates the task in the other space and says so in both threads", async () => {
    const { deps, copies } = setup();

    await expect(copies.copy("task-1", "api", VIEWER)).resolves.toEqual({ id: "task-2" });

    expect(deps.spaceAccess.assertCanSee).toHaveBeenCalledWith(VIEWER, "api");
    expect(deps.tickets.createTicket).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: "api", title: "Gift notes", description: "Let customers add a note.", ticketSystem: "native", requesterId: "user-1" }),
    );
    expect(deps.discussion.create).toHaveBeenCalledWith("task-1", "user-1", "Copied to [API-4](/spaces/api/tasks/API-4) in API.");
    expect(deps.discussion.create).toHaveBeenCalledWith("task-2", "user-1", "Copied from [WEB-1](/spaces/web/tasks/WEB-1) in Web shop.");
  });

  it("refuses to copy a task into its own space", async () => {
    const { deps, copies } = setup();
    deps.spaceAccess.assertCanSee.mockResolvedValue({ projectId: "web", membership: null });

    await expect(copies.copy("task-1", "web", VIEWER)).rejects.toMatchObject({ statusCode: 400 });
    expect(deps.tickets.createTicket).not.toHaveBeenCalled();
  });
});
