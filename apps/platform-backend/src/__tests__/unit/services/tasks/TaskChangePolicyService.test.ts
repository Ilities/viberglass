import { canChangeTask, type TaskChangeParticipant, type WorkspaceRole } from "@viberglass/types";
import { TaskChangePolicyService } from "../../../../services/tasks/TaskChangePolicyService";
import { TaskChangePolicyError } from "../../../../services/errors/TaskChangePolicyError";

const participants: TaskChangeParticipant[] = [
  { userId: "maria", role: "requester" },
  { userId: "dev", role: "owner" },
  { userId: "tomi", role: "reviewer" },
  { userId: "kaisa", role: "watcher" },
];

const person = (userId: string, workspaceRole: WorkspaceRole = "member", spaceRole: "maintainer" | "member" | null = null) => ({
  userId,
  workspaceRole,
  spaceRole,
});

describe("task change rules", () => {
  it("lets the requester and owner edit, but not reviewers, watchers or others", () => {
    expect(canChangeTask("edit", person("maria"), participants)).toBe(true);
    expect(canChangeTask("edit", person("dev"), participants)).toBe(true);
    expect(canChangeTask("edit", person("tomi"), participants)).toBe(false);
    expect(canChangeTask("edit", person("kaisa"), participants)).toBe(false);
    expect(canChangeTask("edit", person("stranger"), participants)).toBe(false);
  });

  it("lets the space's maintainers and workspace admins edit any task", () => {
    expect(canChangeTask("edit", person("lead", "member", "maintainer"), [])).toBe(true);
    expect(canChangeTask("edit", person("admin", "admin"), [])).toBe(true);
  });

  it("never lets guests or viewers change a task, even their own", () => {
    const own: TaskChangeParticipant[] = [{ userId: "g", role: "requester" }];
    expect(canChangeTask("edit", person("g", "guest", "maintainer"), own)).toBe(false);
    expect(canChangeTask("edit", person("g", "viewer"), own)).toBe(false);
  });

  it("keeps hard delete for workspace admins", () => {
    expect(canChangeTask("delete", person("admin", "admin"), [])).toBe(true);
    expect(canChangeTask("delete", person("dev"), participants)).toBe(false);
    expect(canChangeTask("delete", person("lead", "member", "maintainer"), participants)).toBe(false);
  });
});

describe("TaskChangePolicyService", () => {
  function service(projectId: string | null = "space-1", spaceRole: "maintainer" | "member" | null = "member") {
    return new TaskChangePolicyService({
      owners: { projectIdForTask: jest.fn(async () => projectId) },
      members: { getRole: jest.fn(async () => spaceRole) },
      participants: { list: jest.fn(async () => participants.map((p) => ({ ...p, name: p.userId, email: "", addedAt: "" }))) },
    });
  }

  it("passes the task's owner and refuses a guest with a reason", async () => {
    await expect(service().assertCanChange({ id: "dev", role: "member" }, "t", "edit")).resolves.toBeUndefined();
    const refused = service().assertCanChange({ id: "tomi", role: "guest" }, "t", "edit");
    await expect(refused).rejects.toBeInstanceOf(TaskChangePolicyError);
    await expect(refused).rejects.toThrow("requester and owner");
  });

  it("tells a member to archive instead of deleting", async () => {
    await expect(service().assertCanChange({ id: "dev", role: "member" }, "t", "delete")).rejects.toThrow("Archive it instead");
  });

  it("describes what the caller may change, so the UI shows only that", async () => {
    await expect(service().describe({ id: "dev", role: "member" }, "t")).resolves.toEqual({ canEdit: true, canDelete: false });
    await expect(service().describe({ id: "tomi", role: "member" }, "t")).resolves.toEqual({ canEdit: false, canDelete: false });
    await expect(service().describe({ id: "anyone", role: "admin" }, "t")).resolves.toEqual({ canEdit: true, canDelete: true });
    await expect(service(null).describe({ id: "dev", role: "member" }, "t")).resolves.toEqual({ canEdit: false, canDelete: false });
  });

  it("leaves a task that doesn't exist to the route's 404", async () => {
    await expect(service(null).assertCanChange({ id: "tomi", role: "guest" }, "t", "delete")).resolves.toBeUndefined();
  });
});
