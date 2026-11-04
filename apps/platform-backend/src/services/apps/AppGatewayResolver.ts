import type { AppHost } from "@viberglass/types";
import { hashToken } from "../../api/auth/utils";
import type { AppSessionUser, AppSignInDAO } from "../../persistence/apps/AppSignInDAO";
import type { AppTarget, AppTargets } from "./AppTargets";
import { ExpiringCache } from "./ExpiringCache";

/** What the gateway does with one request to an app's host. */
export type AppGatewayRoute =
  | { kind: "unknown" }
  | { kind: "sign-in" }
  | { kind: "forbidden" }
  | { kind: "off"; appName: string; maintainers: string[] }
  | { kind: "preview_off"; taskKey: string; taskPath: string }
  | { kind: "proxy"; target: string; user: AppSessionUser; previewId: string | null };

const CACHE_MS = 15_000;
const CACHE_LIMIT = 5_000;

/**
 * Decides each request from its host and gateway session. Answers are kept for
 * a few seconds, because an app's page pulls many files at once; losing access
 * or turning an app or preview off takes effect within that time. Tokens that
 * aren't a session aren't kept, so made-up ones can't push out real decisions.
 */
export class AppGatewayResolver {
  private readonly routes: ExpiringCache<AppGatewayRoute>;
  private readonly targetByLabel: ExpiringCache<AppTarget | null>;

  constructor(
    private readonly targets: Pick<AppTargets, "find" | "canOpen" | "closed" | "instance">,
    private readonly signIns: Pick<AppSignInDAO, "findSessionUser">,
    private readonly host: () => AppHost | null,
    now: () => number = Date.now,
  ) {
    this.routes = new ExpiringCache(CACHE_MS, CACHE_LIMIT, now);
    this.targetByLabel = new ExpiringCache(CACHE_MS, CACHE_LIMIT, now);
  }

  async resolve(label: string, sessionToken: string | null): Promise<AppGatewayRoute> {
    const key = `${label}\n${sessionToken ? hashToken(sessionToken) : ""}`;
    const cached = this.routes.get(key);
    if (cached) return cached;

    const route = await this.decide(label, sessionToken);
    // Someone waiting for an app or preview to come up sees it as soon as it does.
    const waiting = route.kind === "off" || route.kind === "preview_off";
    if (!(sessionToken && route.kind === "sign-in") && !waiting) this.routes.set(key, route);
    return route;
  }

  private async target(label: string): Promise<AppTarget | null> {
    const cached = this.targetByLabel.get(label);
    if (cached !== undefined) return cached;
    const target = await this.targets.find(label);
    // A preview's target carries its state, which changes too often to keep.
    if (target?.kind !== "preview") this.targetByLabel.set(label, target);
    return target;
  }

  private async decide(label: string, sessionToken: string | null): Promise<AppGatewayRoute> {
    const target = await this.target(label);
    if (!target) return { kind: "unknown" };
    if (!sessionToken) return { kind: "sign-in" };
    const user = await this.signIns.findSessionUser(hashToken(sessionToken), target.projectId, target.previewId);
    if (!user) return { kind: "sign-in" };
    if (!(await this.targets.canOpen(user, target))) return { kind: "forbidden" };

    const closed = await this.targets.closed(target);
    if (closed) return closed;
    const host = this.host();
    if (!host) return { kind: "off", appName: target.label, maintainers: [] };
    return { kind: "proxy", target: host.address(this.targets.instance(target)), user, previewId: target.previewId };
  }
}
