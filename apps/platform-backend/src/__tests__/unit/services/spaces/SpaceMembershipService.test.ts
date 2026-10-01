import { SpaceMembershipService } from "../../../../services/spaces/SpaceMembershipService";

const at = new Date("2026-09-30T10:00:00Z");

function setup(user: { deactivatedAt: Date | null } | null) {
  const members = {
    listMembers: jest.fn().mockResolvedValue([]),
    upsert: jest.fn().mockResolvedValue(undefined),
    remove: jest.fn().mockResolvedValue(true),
  };
  const users = {
    findById: jest.fn().mockResolvedValue(
      user && { id: "user-2", email: "g@example.com", name: "G", avatarUrl: null, role: "guest", createdAt: at, updatedAt: at, ...user },
    ),
  };
  return { members, service: new SpaceMembershipService(members, users) };
}

describe("SpaceMembershipService", () => {
  it("adds a workspace person to the space with a role", async () => {
    const { members, service } = setup({ deactivatedAt: null });

    await service.setRole({ projectId: "space-1", userId: "user-2", role: "member", actorId: "user-1" });

    expect(members.upsert).toHaveBeenCalledWith({ projectId: "space-1", userId: "user-2", role: "member", addedBy: "user-1" });
  });

  it("won't add a deactivated person", async () => {
    const { service } = setup({ deactivatedAt: at });

    await expect(
      service.setRole({ projectId: "space-1", userId: "user-2", role: "member", actorId: "user-1" }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it("says when the person wasn't a member", async () => {
    const { members, service } = setup({ deactivatedAt: null });
    members.remove.mockResolvedValue(false);

    await expect(service.remove("space-1", "user-2")).rejects.toMatchObject({ code: "SPACE_MEMBER_NOT_FOUND" });
  });
});
