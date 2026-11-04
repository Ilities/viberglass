import { hashToken } from "../../../../api/auth/utils";
import type { AppRecord } from "../../../../persistence/apps/AppDAO";
import { AppGatewayResolver } from "../../../../services/apps/AppGatewayResolver";
import { fakeAppHost } from "../../../helpers/fakeAppHost";

jest.mock("../../../../persistence/config/database", () => ({ __esModule: true, default: {} }));

const SPACE = { projectId: "space-1", slug: "laptops", name: "Laptops", isPrivate: true };
const RUNNING: AppRecord = { projectId: "space-1", power: "on", state: "running", statusMessage: null, currentReleaseId: "r1", busySince: null };
const ADA = { id: "user-1", email: "ada@example.com", name: "Ada", role: "member" as const };

function build(options: { app?: AppRecord | null; canOpen?: boolean } = {}) {
  let now = 0;
  const host = fakeAppHost();
  const deps = {
    spaces: { findBySlug: jest.fn(async (slug: string) => (slug === "laptops" ? SPACE : null)) },
    apps: { get: jest.fn(async () => (options.app === undefined ? RUNNING : options.app)) },
    signIns: { findSessionUser: jest.fn(async (tokenHash: string) => (tokenHash === hashToken("good") ? ADA : null)) },
    access: { canOpen: jest.fn(async () => options.canOpen ?? true), maintainerNames: jest.fn(async () => ["Grace"]) },
  };
  const resolver = new AppGatewayResolver(deps.spaces, deps.apps, deps.signIns, deps.access, () => host, () => now);
  return { resolver, deps, host, advance: (ms: number) => (now += ms) };
}

describe("AppGatewayResolver", () => {
  it("passes a signed-in person with access on to the running app", async () => {
    const { resolver, host } = build();

    await expect(resolver.resolve("laptops", "good")).resolves.toEqual({ kind: "proxy", target: host.address("space-1"), user: ADA });
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
});
