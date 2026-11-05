import { hashToken } from "../../../../api/auth/utils";
import type { AppRecord } from "../../../../persistence/apps/AppDAO";
import { AppSignInService } from "../../../../services/apps/AppSignInService";
import { AppSpaceError } from "../../../../services/apps/AppSpaceError";
import { AppTargets } from "../../../../services/apps/AppTargets";
import type { PreviewAddressRef } from "../../../../persistence/apps/AppPreviewDAO";

jest.mock("../../../../persistence/config/database", () => ({ __esModule: true, default: {} }));

const SPACE = { projectId: "space-1", slug: "laptops", name: "Laptops", isPrivate: false };
const RUNNING: AppRecord = { projectId: "space-1", power: "on", state: "running", statusMessage: null, currentReleaseId: "r1", busySince: null, rollback: null, credentialsExpireAt: null, archiveBackupDue: false, restartDue: false };
const VIEWER = { id: "user-1", role: "member" as const, sessionId: "session-1" };
const STATE = "state-from-the-gateway-cookie-0123456789ab";
const PREVIEW: PreviewAddressRef = {
  previewId: "pv-1",
  address: "preview-abcd2345",
  projectId: "space-1",
  projectSlug: "laptops",
  isPrivate: false,
  ticketId: "task-1",
  taskKey: "LT-2",
  state: "running",
};

function build(options: { app?: AppRecord | null; canOpen?: boolean; preview?: PreviewAddressRef; sessionExpiry?: Date | null } = {}) {
  const deps = {
    spaces: { findBySlug: jest.fn(async (slug: string) => (slug === "laptops" ? SPACE : null)) },
    apps: { get: jest.fn(async () => (options.app === undefined ? RUNNING : options.app)) },
    previews: { findByAddress: jest.fn(async (address: string) => (address === PREVIEW.address ? (options.preview ?? PREVIEW) : null)) },
    access: {
      canOpen: jest.fn(async () => options.canOpen ?? true),
      canSeeSpace: jest.fn(async () => options.canOpen ?? true),
      maintainerNames: jest.fn(async () => ["Ada"]),
    },
    signIns: {
      createCode: jest.fn(async (_input: {
        codeHash: string;
        stateHash: string;
        projectId: string;
        previewId: string | null;
        sessionId: string;
        returnPath: string;
        expiresAt: Date;
      }) => undefined),
      redeemCode: jest.fn(async (): Promise<{ sessionId: string; returnPath: string } | null> => ({ sessionId: "session-1", returnPath: "/laptops" })),
      createSession: jest.fn(async () => undefined),
      userSessionExpiry: jest.fn(async () => (options.sessionExpiry === undefined ? new Date(Date.now() + 86_400_000) : options.sessionExpiry)),
      deleteExpired: jest.fn(async () => undefined),
    },
    origins: { originFor: (slug: string) => `https://${slug}.apps.example.com` },
  };
  const targets = new AppTargets(deps.spaces, deps.previews, deps.apps, deps.access);
  return { service: new AppSignInService(targets, deps.signIns, deps.origins), deps };
}

describe("AppSignInService", () => {
  it("hands a running app a single-use code bound to the app, the person's session and the browser's sign-in", async () => {
    const { service, deps } = build();

    const handoff = await service.handoff(VIEWER, "laptops", "//evil.test", STATE);

    expect(handoff.status).toBe("ready");
    const url = new URL(handoff.status === "ready" ? handoff.url : "");
    expect(url.origin).toBe("https://laptops.apps.example.com");
    expect(url.pathname).toBe("/_viberglass/callback");
    const code = url.searchParams.get("code") ?? "";
    expect(deps.signIns.createCode).toHaveBeenCalledWith(
      expect.objectContaining({
        codeHash: hashToken(code),
        stateHash: hashToken(STATE),
        projectId: "space-1",
        previewId: null,
        sessionId: "session-1",
        returnPath: "/",
      }),
    );
    const { expiresAt } = deps.signIns.createCode.mock.calls[0]![0];
    expect(expiresAt.getTime() - Date.now()).toBeLessThanOrEqual(60_000);
  });

  it("sends the browser to the app first when no sign-in was started there, so the gateway can start one", async () => {
    const { service, deps } = build();

    await expect(service.handoff(VIEWER, "laptops", "/laptops?status=lent", undefined)).resolves.toEqual({
      status: "ready",
      url: "https://laptops.apps.example.com/laptops?status=lent",
    });
    await expect(service.handoff(VIEWER, "laptops", "/", "short")).resolves.toEqual({ status: "ready", url: "https://laptops.apps.example.com/" });
    expect(deps.signIns.createCode).not.toHaveBeenCalled();
  });

  it("answers an unknown app and one the person can't open the same way", async () => {
    await expect(build().service.handoff(VIEWER, "payroll", "/", STATE)).rejects.toMatchObject({ code: "APP_NOT_FOUND" });
    await expect(build({ canOpen: false }).service.handoff(VIEWER, "laptops", "/", STATE)).rejects.toBeInstanceOf(AppSpaceError);
  });

  it("says who can turn the app on instead of issuing a code while it's off", async () => {
    const { service, deps } = build({ app: { ...RUNNING, state: "off", power: "off" } });

    await expect(service.handoff(VIEWER, "laptops", "/", STATE)).resolves.toEqual({ status: "off", appName: "Laptops", maintainers: ["Ada"] });
    expect(deps.signIns.createCode).not.toHaveBeenCalled();
  });

  it("trades a code for a gateway session that never outlives the Viberglass session", async () => {
    const sessionExpiry = new Date(Date.now() + 60 * 60 * 1000);
    const { service, deps } = build({ sessionExpiry });

    const redeemed = await service.redeem("laptops", "code-1", STATE);

    expect(deps.signIns.redeemCode).toHaveBeenCalledWith(hashToken("code-1"), hashToken(STATE), "space-1", null);
    expect(redeemed).toMatchObject({ returnPath: "/laptops", expiresAt: sessionExpiry });
    expect(deps.signIns.createSession).toHaveBeenCalledWith({
      tokenHash: hashToken(redeemed?.token ?? ""),
      projectId: "space-1",
      previewId: null,
      sessionId: "session-1",
      expiresAt: sessionExpiry,
    });
  });

  it("binds a preview's code and session to that preview", async () => {
    const { service, deps } = build();

    const handoff = await service.handoff(VIEWER, PREVIEW.address, "/", STATE);
    expect(handoff).toMatchObject({ status: "ready", url: expect.stringMatching(/^https:\/\/preview-abcd2345\.apps\.example\.com\/_viberglass\/callback\?code=/) });
    expect(deps.signIns.createCode).toHaveBeenCalledWith(expect.objectContaining({ projectId: "space-1", previewId: "pv-1" }));

    await service.redeem(PREVIEW.address, "code-1", STATE);
    expect(deps.signIns.redeemCode).toHaveBeenCalledWith(hashToken("code-1"), hashToken(STATE), "space-1", "pv-1");
    expect(deps.signIns.createSession).toHaveBeenCalledWith(expect.objectContaining({ projectId: "space-1", previewId: "pv-1" }));
  });

  it("points at the task instead of issuing a code while a preview is off", async () => {
    const { service, deps } = build({ preview: { ...PREVIEW, state: "off" } });

    await expect(service.handoff(VIEWER, PREVIEW.address, "/", STATE)).resolves.toEqual({
      status: "preview_off",
      taskKey: "LT-2",
      taskPath: "/spaces/laptops/tasks/task-1",
    });
    expect(deps.signIns.createCode).not.toHaveBeenCalled();
  });

  it("refuses a code that's used, expired or for another app", async () => {
    const { service, deps } = build();
    deps.signIns.redeemCode.mockResolvedValueOnce(null);

    await expect(service.redeem("laptops", "code-1", STATE)).resolves.toBeNull();
    await expect(service.redeem("payroll", "code-1", STATE)).resolves.toBeNull();
    expect(deps.signIns.createSession).not.toHaveBeenCalled();
  });
});
