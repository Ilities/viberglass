import { artifactReviewers, canAskAgent, canAskForCode, type AskingParticipant, type WorkspaceRole } from "@viberglass/types";
import { TaskAskPolicyService } from "../../../../services/taskTurns/TaskAskPolicyService";
import { SpaceAccessError, SPACE_ACCESS_ERROR_CODE } from "../../../../services/errors/SpaceAccessError";

const TASK_ID = "11111111-1111-4111-8111-111111111111";

const participants: AskingParticipant[] = [
  { userId: "maria", role: "requester" },
  { userId: "owner", role: "owner" },
  { userId: "tomi", role: "reviewer" },
  { userId: "kaisa", role: "watcher" },
];

const person = (userId: string, workspaceRole: WorkspaceRole = "member", spaceRole: "maintainer" | "member" | null = null) => ({
  userId,
  workspaceRole,
  spaceRole,
});

describe("ask rules", () => {
  it("lets anyone on the task ask for code, whatever their role on it", () => {
    for (const id of ["maria", "owner", "tomi", "kaisa"]) expect(canAskForCode(person(id), participants)).toBe(true);
    expect(canAskForCode(person("stranger"), participants)).toBe(false);
  });

  it("lets workspace admins and the space's maintainers ask for code without being on the task", () => {
    expect(canAskForCode(person("admin", "admin"), [])).toBe(true);
    expect(canAskForCode(person("lead", "member", "maintainer"), [])).toBe(true);
  });

  it("lets members ask for research and plans on any task they can see, and guests only on tasks they're on", () => {
    expect(canAskAgent(person("stranger"), participants)).toBe(true);
    expect(canAskAgent(person("tomi", "guest"), participants)).toBe(true);
    expect(canAskAgent(person("visitor", "guest"), participants)).toBe(false);
    expect(canAskForCode(person("tomi", "guest"), participants)).toBe(true);
    expect(canAskForCode(person("visitor", "guest"), participants)).toBe(false);
  });

  it("never lets a viewer ask", () => {
    expect(canAskAgent(person("maria", "viewer"), participants)).toBe(false);
    expect(canAskForCode(person("maria", "viewer", "maintainer"), participants)).toBe(false);
  });

  it("mentions the reviewers when an artifact is ready, else the owner", () => {
    expect(artifactReviewers(participants)).toEqual(["tomi"]);
    expect(artifactReviewers(participants.filter((p) => p.role !== "reviewer"))).toEqual(["owner"]);
  });
});

describe("TaskAskPolicyService", () => {
  const taskParticipants = [
    { userId: "owner", name: "Olli Owner", email: "o@x", role: "owner" as const, addedAt: "" },
    { userId: "tomi", name: "Tomi Reviewer", email: "t@x", role: "reviewer" as const, addedAt: "" },
  ];

  function service(options: { role?: WorkspaceRole; spaceRole?: "maintainer" | "member" | null; canSee?: boolean; deactivated?: boolean } = {}) {
    const access = {
      assertCanSee: jest.fn(async () => {
        if (options.canSee === false) throw new SpaceAccessError(SPACE_ACCESS_ERROR_CODE.NOT_FOUND, "Space not found");
        return { projectId: "space-1", membership: null };
      }),
    };
    return new TaskAskPolicyService({
      users: {
        findById: jest.fn(async (id: string) => ({
          id,
          email: `${id}@x`,
          name: id,
          role: options.role ?? "member",
          avatarUrl: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          deactivatedAt: options.deactivated ? new Date() : null,
        })),
      },
      owners: { projectIdForTask: jest.fn().mockResolvedValue("space-1") },
      members: { getRole: jest.fn().mockResolvedValue(options.spaceRole ?? null) },
      access,
      participants: { list: jest.fn().mockResolvedValue(taskParticipants) },
    });
  }

  it("describes what the caller may ask for", async () => {
    await expect(service().describe("tomi", TASK_ID)).resolves.toEqual({ canPost: true, canAsk: true, canAskForCode: true });
    await expect(service().describe("stranger", TASK_ID)).resolves.toEqual({ canPost: true, canAsk: true, canAskForCode: false });
    await expect(service({ role: "guest" }).describe("visitor", TASK_ID)).resolves.toEqual({ canPost: true, canAsk: false, canAskForCode: false });
    await expect(service({ role: "viewer" }).describe("tomi", TASK_ID)).resolves.toEqual({ canPost: false, canAsk: false, canAskForCode: false });
  });

  it("refuses a build from someone who isn't on the task, saying who can ask", async () => {
    await expect(service().assertCanAsk("stranger", TASK_ID, "code")).rejects.toMatchObject({
      code: "ASK_NOT_ALLOWED",
      statusCode: 403,
      message:
        "Only the task's people, this space's maintainers or a workspace admin can ask the agent to build. Ask one of them, or ask to be added to the task.",
    });
    await expect(service().assertCanAsk("stranger", TASK_ID, "plan")).resolves.toBeUndefined();
  });

  it("lets a maintainer ask for a build without being on the task", async () => {
    await expect(service({ spaceRole: "maintainer" }).assertCanAsk("lead", TASK_ID, "code")).resolves.toBeUndefined();
  });

  it("refuses a guest who isn't on the task anything", async () => {
    await expect(service({ role: "guest" }).assertCanAsk("visitor", TASK_ID, "research")).rejects.toMatchObject({ code: "ASK_NOT_ALLOWED" });
  });

  it("lets the system ask for anything but code", async () => {
    await expect(service().assertCanAsk(null, TASK_ID, "research")).resolves.toBeUndefined();
    await expect(service().assertCanAsk(null, TASK_ID, "code")).rejects.toMatchObject({ code: "ASK_NO_PERSON" });
  });

  it("refuses someone who can no longer see the space, or who was deactivated", async () => {
    await expect(service({ canSee: false }).assertCanAsk("tomi", TASK_ID, "code")).rejects.toMatchObject({ code: "ASK_NOT_ALLOWED" });
    await expect(service({ deactivated: true }).assertCanAsk("tomi", TASK_ID, "reply")).rejects.toMatchObject({ code: "ASK_NOT_ALLOWED" });
  });
});
