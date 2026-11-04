import type { SpaceMember } from "@viberglass/types";
import { AppAccess } from "../../../../services/apps/AppAccess";

const OPEN = { projectId: "space-1", isPrivate: false };
const PRIVATE = { projectId: "space-1", isPrivate: true };

function access(options: { membership?: "maintainer" | "member" | null; listed?: boolean; members?: SpaceMember[] } = {}) {
  const members = {
    getRole: jest.fn(async () => options.membership ?? null),
    listMembers: jest.fn(async () => options.members ?? []),
  };
  const accessList = { has: jest.fn(async () => options.listed ?? false) };
  return { appAccess: new AppAccess(members, accessList), accessList };
}

const member = (name: string, workspaceRole: SpaceMember["workspaceRole"], role: SpaceMember["role"]): SpaceMember => ({
  userId: name,
  name,
  email: `${name}@example.com`,
  workspaceRole,
  role,
  addedAt: "",
});

describe("AppAccess", () => {
  it("lets everyone who sees the space open its app, without checking the access list", async () => {
    const { appAccess, accessList } = access();

    await expect(appAccess.canOpen({ id: "u", role: "member" }, OPEN)).resolves.toBe(true);
    expect(accessList.has).not.toHaveBeenCalled();
  });

  it("lets people on the access list open an app in a space they can't see", async () => {
    await expect(access({ listed: true }).appAccess.canOpen({ id: "u", role: "app_user" }, OPEN)).resolves.toBe(true);
    await expect(access({ listed: true }).appAccess.canOpen({ id: "u", role: "member" }, PRIVATE)).resolves.toBe(true);
    await expect(access({ listed: true }).appAccess.canOpen({ id: "u", role: "guest" }, PRIVATE)).resolves.toBe(true);
  });

  it("refuses app users and outsiders who aren't on the list", async () => {
    await expect(access().appAccess.canOpen({ id: "u", role: "app_user" }, OPEN)).resolves.toBe(false);
    await expect(access({ membership: "maintainer" }).appAccess.canOpen({ id: "u", role: "app_user" }, OPEN)).resolves.toBe(false);
    await expect(access().appAccess.canOpen({ id: "u", role: "member" }, PRIVATE)).resolves.toBe(false);
  });

  it("names only maintainers who can still turn the app on", async () => {
    const { appAccess } = access({
      members: [member("Ada", "member", "maintainer"), member("Bo", "member", "member"), member("Cy", "app_user", "maintainer")],
    });

    await expect(appAccess.maintainerNames("space-1")).resolves.toEqual(["Ada"]);
  });
});
