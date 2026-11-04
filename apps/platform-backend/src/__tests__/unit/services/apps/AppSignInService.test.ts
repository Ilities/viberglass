import { hashToken } from "../../../../api/auth/utils";
import type { AppRecord } from "../../../../persistence/apps/AppDAO";
import { AppSignInService } from "../../../../services/apps/AppSignInService";
import { AppSpaceError } from "../../../../services/apps/AppSpaceError";

jest.mock("../../../../persistence/config/database", () => ({ __esModule: true, default: {} }));

const SPACE = { projectId: "space-1", slug: "laptops", name: "Laptops", isPrivate: false };
const RUNNING: AppRecord = { projectId: "space-1", power: "on", state: "running", statusMessage: null, currentReleaseId: "r1", busySince: null };
const VIEWER = { id: "user-1", role: "member" as const, sessionId: "session-1" };

function build(options: { app?: AppRecord | null; canOpen?: boolean; sessionExpiry?: Date | null } = {}) {
  const deps = {
    spaces: { findBySlug: jest.fn(async (slug: string) => (slug === "laptops" ? SPACE : null)) },
    apps: { get: jest.fn(async () => (options.app === undefined ? RUNNING : options.app)) },
    access: { canOpen: jest.fn(async () => options.canOpen ?? true), maintainerNames: jest.fn(async () => ["Ada"]) },
    signIns: {
      createCode: jest.fn(async (_input: { codeHash: string; projectId: string; sessionId: string; returnPath: string; expiresAt: Date }) => undefined),
      redeemCode: jest.fn(async (): Promise<{ sessionId: string; returnPath: string } | null> => ({ sessionId: "session-1", returnPath: "/laptops" })),
      createSession: jest.fn(async () => undefined),
      userSessionExpiry: jest.fn(async () => (options.sessionExpiry === undefined ? new Date(Date.now() + 86_400_000) : options.sessionExpiry)),
      deleteExpired: jest.fn(async () => undefined),
    },
    origins: { originFor: (slug: string) => `https://${slug}.apps.example.com` },
  };
  return { service: new AppSignInService(deps.spaces, deps.apps, deps.access, deps.signIns, deps.origins), deps };
}

describe("AppSignInService", () => {
  it("hands a running app a single-use code bound to the app and the person's session", async () => {
    const { service, deps } = build();

    const handoff = await service.handoff(VIEWER, "laptops", "//evil.test");

    expect(handoff.status).toBe("ready");
    const url = new URL(handoff.status === "ready" ? handoff.url : "");
    expect(url.origin).toBe("https://laptops.apps.example.com");
    expect(url.pathname).toBe("/_viberglass/callback");
    const code = url.searchParams.get("code") ?? "";
    expect(deps.signIns.createCode).toHaveBeenCalledWith(
      expect.objectContaining({ codeHash: hashToken(code), projectId: "space-1", sessionId: "session-1", returnPath: "/" }),
    );
    const { expiresAt } = deps.signIns.createCode.mock.calls[0]![0];
    expect(expiresAt.getTime() - Date.now()).toBeLessThanOrEqual(60_000);
  });

  it("answers an unknown app and one the person can't open the same way", async () => {
    await expect(build().service.handoff(VIEWER, "payroll", "/")).rejects.toMatchObject({ code: "APP_NOT_FOUND" });
    await expect(build({ canOpen: false }).service.handoff(VIEWER, "laptops", "/")).rejects.toBeInstanceOf(AppSpaceError);
  });

  it("says who can turn the app on instead of issuing a code while it's off", async () => {
    const { service, deps } = build({ app: { ...RUNNING, state: "off", power: "off" } });

    await expect(service.handoff(VIEWER, "laptops", "/")).resolves.toEqual({ status: "off", appName: "Laptops", maintainers: ["Ada"] });
    expect(deps.signIns.createCode).not.toHaveBeenCalled();
  });

  it("trades a code for a gateway session that never outlives the Viberglass session", async () => {
    const sessionExpiry = new Date(Date.now() + 60 * 60 * 1000);
    const { service, deps } = build({ sessionExpiry });

    const redeemed = await service.redeem("laptops", "code-1");

    expect(deps.signIns.redeemCode).toHaveBeenCalledWith(hashToken("code-1"), "space-1");
    expect(redeemed).toMatchObject({ returnPath: "/laptops", expiresAt: sessionExpiry });
    expect(deps.signIns.createSession).toHaveBeenCalledWith({
      tokenHash: hashToken(redeemed?.token ?? ""),
      projectId: "space-1",
      sessionId: "session-1",
      expiresAt: sessionExpiry,
    });
  });

  it("refuses a code that's used, expired or for another app", async () => {
    const { service, deps } = build();
    deps.signIns.redeemCode.mockResolvedValueOnce(null);

    await expect(service.redeem("laptops", "code-1")).resolves.toBeNull();
    await expect(service.redeem("payroll", "code-1")).resolves.toBeNull();
    expect(deps.signIns.createSession).not.toHaveBeenCalled();
  });
});
