import type { AppHost } from "@viberglass/types";
import { hashToken } from "../../api/auth/utils";
import type { AppDAO } from "../../persistence/apps/AppDAO";
import type { AppSessionUser, AppSignInDAO } from "../../persistence/apps/AppSignInDAO";
import type { AppSpaceDAO } from "../../persistence/apps/AppSpaceDAO";
import type { AppAccess } from "./AppAccess";

/** What the gateway does with one request to an app's host. */
export type AppGatewayRoute =
  | { kind: "unknown" }
  | { kind: "sign-in" }
  | { kind: "forbidden" }
  | { kind: "off"; appName: string; maintainers: string[] }
  | { kind: "proxy"; target: string; user: AppSessionUser };

const CACHE_MS = 15_000;
const CACHE_LIMIT = 5_000;

/**
 * Decides each request from its host and gateway session. Answers are kept for
 * a few seconds, because an app's page pulls many files at once; losing access
 * or turning an app off takes effect within that time.
 */
export class AppGatewayResolver {
  private readonly cache = new Map<string, { route: AppGatewayRoute; until: number }>();

  constructor(
    private readonly spaces: Pick<AppSpaceDAO, "findBySlug">,
    private readonly apps: Pick<AppDAO, "get">,
    private readonly signIns: Pick<AppSignInDAO, "findSessionUser">,
    private readonly access: Pick<AppAccess, "canOpen" | "maintainerNames">,
    private readonly host: () => AppHost | null,
    private readonly now: () => number = Date.now,
  ) {}

  async resolve(slug: string, sessionToken: string | null): Promise<AppGatewayRoute> {
    const key = `${slug}\n${sessionToken ? hashToken(sessionToken) : ""}`;
    const cached = this.cache.get(key);
    if (cached && cached.until > this.now()) return cached.route;

    const route = await this.decide(slug, sessionToken);
    if (this.cache.size >= CACHE_LIMIT) this.cache.clear();
    this.cache.set(key, { route, until: this.now() + CACHE_MS });
    return route;
  }

  private async decide(slug: string, sessionToken: string | null): Promise<AppGatewayRoute> {
    const space = await this.spaces.findBySlug(slug);
    if (!space) return { kind: "unknown" };
    if (!sessionToken) return { kind: "sign-in" };
    const user = await this.signIns.findSessionUser(hashToken(sessionToken), space.projectId);
    if (!user) return { kind: "sign-in" };
    if (!(await this.access.canOpen(user, space))) return { kind: "forbidden" };

    const app = await this.apps.get(space.projectId);
    const host = this.host();
    if (app?.state !== "running" || !host) {
      return { kind: "off", appName: space.name, maintainers: await this.access.maintainerNames(space.projectId) };
    }
    return { kind: "proxy", target: host.address(space.projectId), user };
  }
}
