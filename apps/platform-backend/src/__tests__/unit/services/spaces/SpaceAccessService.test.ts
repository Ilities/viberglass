import { canMaintainSpace, canSeeSpace } from "@viberglass/types";
import { SpaceAccessService } from "../../../../services/spaces/SpaceAccessService";

const SPACE_ID = "11111111-1111-4111-8111-111111111111";

function service(options: { isPrivate: boolean; membership: "maintainer" | "member" | null }) {
  const projects = {
    getProject: jest.fn().mockResolvedValue({ id: SPACE_ID, isPrivate: options.isPrivate }),
    findByName: jest.fn().mockResolvedValue({ id: SPACE_ID, isPrivate: options.isPrivate }),
  };
  const members = {
    getRole: jest.fn().mockResolvedValue(options.membership),
    listVisibleProjectIds: jest.fn().mockResolvedValue([SPACE_ID]),
  };
  return { projects, members, access: new SpaceAccessService({ projects, members }) };
}

describe("space visibility rules (ADR 0005)", () => {
  it("shows open spaces to members and viewers, and only joined spaces to guests", () => {
    expect(canSeeSpace("member", { isPrivate: false }, null)).toBe(true);
    expect(canSeeSpace("viewer", { isPrivate: false }, null)).toBe(true);
    expect(canSeeSpace("guest", { isPrivate: false }, null)).toBe(false);
    expect(canSeeSpace("guest", { isPrivate: true }, "member")).toBe(true);
  });

  it("shows a private space only to its members and admins", () => {
    expect(canSeeSpace("member", { isPrivate: true }, null)).toBe(false);
    expect(canSeeSpace("member", { isPrivate: true }, "member")).toBe(true);
    expect(canSeeSpace("admin", { isPrivate: true }, null)).toBe(true);
  });

  it("lets maintainers and admins change a space", () => {
    expect(canMaintainSpace("member", "maintainer")).toBe(true);
    expect(canMaintainSpace("member", "member")).toBe(false);
    expect(canMaintainSpace("admin", null)).toBe(true);
  });
});

describe("SpaceAccessService", () => {
  const member = { id: "user-2", role: "member" as const };

  it("answers 404 for a private space someone isn't in, so it doesn't leak", async () => {
    const { access } = service({ isPrivate: true, membership: null });

    await expect(access.assertCanSee(member, SPACE_ID)).rejects.toMatchObject({ statusCode: 404 });
  });

  it("resolves a slug as well as an id", async () => {
    const { access, projects } = service({ isPrivate: false, membership: null });

    await expect(access.assertCanSee(member, "web")).resolves.toEqual({ projectId: SPACE_ID, membership: null });
    expect(projects.findByName).toHaveBeenCalledWith("web");
  });

  it("refuses changes from a plain member with 403", async () => {
    const { access } = service({ isPrivate: false, membership: "member" });

    await expect(access.assertCanMaintain(member, SPACE_ID)).rejects.toMatchObject({ statusCode: 403 });
  });

  it("limits lists for everyone but admins, and to joined spaces for guests", async () => {
    const { access, members } = service({ isPrivate: false, membership: null });

    await expect(access.visibleProjectIds({ id: "admin-1", role: "admin" })).resolves.toBeNull();
    await access.visibleProjectIds({ id: "guest-1", role: "guest" });
    expect(members.listVisibleProjectIds).toHaveBeenCalledWith("guest-1", false);
    await access.visibleProjectIds(member);
    expect(members.listVisibleProjectIds).toHaveBeenCalledWith("user-2", true);
  });

  it("scopes a list to a named space, or to every visible one", async () => {
    const { access } = service({ isPrivate: false, membership: null });

    await expect(access.scopeFor(member, SPACE_ID)).resolves.toEqual({ projectId: SPACE_ID, projectIds: null });
    await expect(access.scopeFor(member)).resolves.toEqual({ projectId: undefined, projectIds: [SPACE_ID] });
  });
});
