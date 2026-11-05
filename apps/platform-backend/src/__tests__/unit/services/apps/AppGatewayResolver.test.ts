import { hashToken } from "../../../../api/auth/utils";
import type { AppRecord } from "../../../../persistence/apps/AppDAO";
import type { PreviewAddressRef } from "../../../../persistence/apps/AppPreviewDAO";
import { AppGatewayResolver } from "../../../../services/apps/AppGatewayResolver";
import { AppTargets } from "../../../../services/apps/AppTargets";
import { fakeAppHost } from "../../../helpers/fakeAppHost";

jest.mock("../../../../persistence/config/database", () => ({ __esModule: true, default: {} }));

const SPACE = { projectId: "space-1", slug: "laptops", name: "Laptops", isPrivate: true };
const RUNNING: AppRecord = { projectId: "space-1", power: "on", state: "running", statusMessage: null, currentReleaseId: "r1", busySince: null, rollback: null, credentialsExpireAt: null, archiveBackupDue: false, restartDue: false };
const ADA = { id: "user-1", email: "ada@example.com", name: "Ada", role: "member" as const };
const PREVIEW: PreviewAddressRef = {
  previewId: "pv-1",
  address: "preview-abcd2345",
  projectId: "space-1",
  projectSlug: "laptops",
  isPrivate: true,
  ticketId: "task-1",
  taskKey: "LT-2",
  state: "running",
};

function build(options: { app?: AppRecord | null; canOpen?: boolean; canSee?: boolean; preview?: PreviewAddressRef } = {}) {
  let now = 0;
  const host = fakeAppHost();
  const deps = {
    spaces: { findBySlug: jest.fn(async (slug: string) => (slug === "laptops" ? SPACE : null)) },
    apps: { get: jest.fn(async () => (options.app === undefined ? RUNNING : options.app)) },
    previews: { findByAddress: jest.fn(async (address: string) => (address === PREVIEW.address ? (options.preview ?? PREVIEW) : null)) },
    signIns: { findSessionUser: jest.fn(async (tokenHash: string) => (tokenHash === hashToken("good") ? ADA : null)) },
    access: {
      canOpen: jest.fn(async () => options.canOpen ?? true),
      canSeeSpace: jest.fn(async () => options.canSee ?? true),
      maintainerNames: jest.fn(async () => ["Grace"]),
    },
  };
  const targets = new AppTargets(deps.spaces, deps.previews, deps.apps, deps.access);
  const resolver = new AppGatewayResolver(targets, deps.signIns, () => host, () => now);
  return { resolver, deps, host, advance: (ms: number) => (now += ms) };
}

describe("AppGatewayResolver", () => {
  it("passes a signed-in person with access on to the running app", async () => {
    const { resolver, host } = build();

    await expect(resolver.resolve("laptops", "good")).resolves.toEqual({ kind: "proxy", target: host.address("app-space-1"), user: ADA, previewId: null });
  });

  it("sends people without a valid gateway session to sign in", async () => {
    const { resolver } = build();

    await expect(resolver.resolve("laptops", null)).resolves.toEqual({ kind: "sign-in" });
    await expect(resolver.resolve("laptops", "expired")).resolves.toEqual({ kind: "sign-in" });
  });

  it("refuses people who lost access, and knows no app under an unknown name", async () => {
    await expect(build({ canOpen: false }).resolver.resolve("laptops", "good")).resolves.toEqual({ kind: "forbidden" });
    await expect(build().resolver.resolve("payroll", "good")).resolves.toEqual({ kind: "unknown" });
  });

  it("names the maintainers when the app isn't running", async () => {
    const { resolver } = build({ app: { ...RUNNING, state: "starting" } });

    await expect(resolver.resolve("laptops", "good")).resolves.toEqual({ kind: "off", appName: "Laptops", maintainers: ["Grace"] });
  });

  it("decides again once a few seconds have passed", async () => {
    const { resolver, deps, advance } = build();
    await resolver.resolve("laptops", "good");
    await resolver.resolve("laptops", "good");
    expect(deps.signIns.findSessionUser).toHaveBeenCalledTimes(1);

    deps.access.canOpen.mockResolvedValue(false);
    advance(15_001);

    await expect(resolver.resolve("laptops", "good")).resolves.toEqual({ kind: "forbidden" });
  });

  it("keeps no decision for tokens that aren't a session, and looks each app up once", async () => {
    const { resolver, deps } = build();
    await resolver.resolve("laptops", "made-up");
    await resolver.resolve("laptops", "made-up");
    await resolver.resolve("laptops", "good");

    expect(deps.signIns.findSessionUser).toHaveBeenCalledTimes(3);
    expect(deps.spaces.findBySlug).toHaveBeenCalledTimes(1);
  });

  it("passes people who see the space on to a running preview, with a session for that preview", async () => {
    const { resolver, deps, host } = build();

    await expect(resolver.resolve(PREVIEW.address, "good")).resolves.toEqual({
      kind: "proxy",
      target: host.address("preview-pv-1"),
      user: ADA,
      previewId: "pv-1",
    });
    expect(deps.signIns.findSessionUser).toHaveBeenCalledWith(hashToken("good"), "space-1", "pv-1");
  });

  it("doesn't let the app's access list reach its previews", async () => {
    const { resolver } = build({ canOpen: true, canSee: false });

    await expect(resolver.resolve(PREVIEW.address, "good")).resolves.toEqual({ kind: "forbidden" });
  });

  it("points at the task when a preview is off, and looks again on the next request", async () => {
    const { resolver, deps } = build({ preview: { ...PREVIEW, state: "off" } });

    await expect(resolver.resolve(PREVIEW.address, "good")).resolves.toEqual({
      kind: "preview_off",
      taskKey: "LT-2",
      taskPath: "/spaces/laptops/tasks/task-1",
    });
    deps.previews.findByAddress.mockResolvedValue(PREVIEW);

    await expect(resolver.resolve(PREVIEW.address, "good")).resolves.toMatchObject({ kind: "proxy", previewId: "pv-1" });
  });
});
