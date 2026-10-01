import { canApproveStep, namedApprovers, type ApprovalParticipant, type WorkspaceRole } from "@viberglass/types";
import { ApprovalPolicyService } from "../../../../services/approvals/ApprovalPolicyService";
import { SpaceAccessError, SPACE_ACCESS_ERROR_CODE } from "../../../../services/errors/SpaceAccessError";

const TASK_ID = "11111111-1111-4111-8111-111111111111";

const participants: ApprovalParticipant[] = [
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

describe("approval rules (D4)", () => {
  it("lets any participant approve the research", () => {
    for (const id of ["maria", "owner", "tomi", "kaisa"]) expect(canApproveStep("research", person(id), participants)).toBe(true);
    expect(canApproveStep("research", person("stranger"), participants)).toBe(false);
  });

  it("lets only the reviewers approve the plan", () => {
    expect(canApproveStep("planning", person("tomi"), participants)).toBe(true);
    expect(canApproveStep("planning", person("owner"), participants)).toBe(false);
    expect(canApproveStep("planning", person("maria"), participants)).toBe(false);
  });

  it("falls back to the owner for the plan when the task has no reviewers", () => {
    const noReviewers = participants.filter((p) => p.role !== "reviewer");
    expect(canApproveStep("planning", person("owner"), noReviewers)).toBe(true);
    expect(namedApprovers("planning", noReviewers)).toEqual(["owner"]);
  });

  it("lets workspace admins and the space's maintainers approve anything", () => {
    expect(canApproveStep("planning", person("admin", "admin"), [])).toBe(true);
    expect(canApproveStep("planning", person("lead", "member", "maintainer"), [])).toBe(true);
  });

  it("lets a guest approve when they're the reviewer, and never a viewer", () => {
    expect(canApproveStep("planning", person("tomi", "guest"), participants)).toBe(true);
    expect(canApproveStep("planning", person("tomi", "viewer"), participants)).toBe(false);
    expect(canApproveStep("research", person("maria", "viewer", "maintainer"), participants)).toBe(false);
  });
});

describe("ApprovalPolicyService", () => {
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
    return new ApprovalPolicyService({
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

  it("describes each step for the caller, with the people it waits on", async () => {
    await expect(service().describe("tomi", TASK_ID)).resolves.toEqual({
      research: {
        canApprove: true,
        approvers: [
          { id: "owner", name: "Olli Owner" },
          { id: "tomi", name: "Tomi Reviewer" },
        ],
      },
      planning: { canApprove: true, approvers: [{ id: "tomi", name: "Tomi Reviewer" }] },
    });
    await expect(service().describe("owner", TASK_ID)).resolves.toMatchObject({ planning: { canApprove: false } });
  });

  it("refuses someone the plan doesn't wait on, naming who can approve it", async () => {
    await expect(service().assertCanApprove("owner", TASK_ID, "planning")).rejects.toMatchObject({
      code: "APPROVAL_NOT_ELIGIBLE",
      statusCode: 403,
      message: "Only Tomi Reviewer, this space's maintainers or a workspace admin can approve the plan. Ask one of them, or add yourself as a reviewer.",
    });
  });

  it("lets a maintainer approve without being on the task", async () => {
    await expect(service({ spaceRole: "maintainer" }).assertCanApprove("lead", TASK_ID, "planning")).resolves.toBeUndefined();
  });

  it("refuses with no person behind the action", async () => {
    await expect(service().assertCanApprove(null, TASK_ID, "research")).rejects.toMatchObject({ code: "APPROVAL_NO_PERSON" });
  });

  it("refuses a reviewer who can no longer see the space, or who was deactivated", async () => {
    await expect(service({ canSee: false }).assertCanApprove("tomi", TASK_ID, "planning")).rejects.toMatchObject({
      code: "APPROVAL_NOT_ELIGIBLE",
    });
    await expect(service({ deactivated: true }).assertCanApprove("tomi", TASK_ID, "planning")).rejects.toMatchObject({
      code: "APPROVAL_NOT_ELIGIBLE",
    });
  });
});
