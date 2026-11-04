import type { AppHandoff, WorkspaceRole } from "@viberglass/types";
import { createSingleUseToken, hashToken } from "../../api/auth/utils";
import type { AppSignInDAO } from "../../persistence/apps/AppSignInDAO";
import type { AppOrigins } from "./AppOrigins";
import { appReturnPath } from "./appReturnPath";
import { AppSpaceError } from "./AppSpaceError";
import type { AppTargets } from "./AppTargets";

const CODE_TTL_MS = 60_000;
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

export const APP_CALLBACK_PATH = "/_viberglass/callback";

const STATE = /^[A-Za-z0-9_-]{32,128}$/;

export interface AppSignInViewer {
  id: string;
  role: WorkspaceRole;
  /** The Viberglass session the gateway session hangs off. */
  sessionId: string;
}

/**
 * Signing a person in to one app or preview across origins: the frontend asks
 * for a single-use code on their behalf, and the address trades it for its own session.
 */
export class AppSignInService {
  constructor(
    private readonly targets: Pick<AppTargets, "find" | "canOpen" | "closed">,
    private readonly signIns: Pick<AppSignInDAO, "createCode" | "redeemCode" | "createSession" | "userSessionExpiry" | "deleteExpired">,
    private readonly origins: Pick<AppOrigins, "originFor">,
  ) {}

  /**
   * `state` comes from the gateway's cookie on the app's host. Without one, the
   * browser goes to the app first, and the gateway starts a sign-in it can finish.
   */
  async handoff(viewer: AppSignInViewer, label: string, returnPath: unknown, state: unknown): Promise<AppHandoff> {
    const target = await this.targets.find(label);
    if (!target || !(await this.targets.canOpen(viewer, target))) {
      throw new AppSpaceError("APP_NOT_FOUND", "This app doesn't exist, or you don't have access to it.");
    }
    const origin = this.origins.originFor(target.label);
    if (!origin) throw new AppSpaceError("APP_SPACES_UNAVAILABLE", "Apps aren't served on this workspace.");

    const closed = await this.targets.closed(target);
    if (closed?.kind === "off") return { status: "off", appName: closed.appName, maintainers: closed.maintainers };
    if (closed) return { status: "preview_off", taskKey: closed.taskKey, taskPath: closed.taskPath };

    if (typeof state !== "string" || !STATE.test(state)) {
      return { status: "ready", url: `${origin}${appReturnPath(returnPath)}` };
    }

    await this.signIns.deleteExpired(new Date());
    const { token, tokenHash, expiresAt } = createSingleUseToken(CODE_TTL_MS);
    await this.signIns.createCode({
      codeHash: tokenHash,
      stateHash: hashToken(state),
      projectId: target.projectId,
      previewId: target.previewId,
      sessionId: viewer.sessionId,
      returnPath: appReturnPath(returnPath),
      expiresAt,
    });
    return { status: "ready", url: `${origin}${APP_CALLBACK_PATH}?code=${encodeURIComponent(token)}` };
  }

  /** Trades a code for a gateway session on the address and browser it was issued for; null when the code can't be used. */
  async redeem(label: string, code: string, state: string): Promise<{ token: string; returnPath: string; expiresAt: Date } | null> {
    const target = await this.targets.find(label);
    if (!target) return null;
    const redeemed = await this.signIns.redeemCode(hashToken(code), hashToken(state), target.projectId, target.previewId);
    if (!redeemed) return null;
    const sessionExpiry = await this.signIns.userSessionExpiry(redeemed.sessionId);
    if (!sessionExpiry) return null;

    const session = createSingleUseToken(SESSION_TTL_MS);
    const expiresAt = new Date(Math.min(session.expiresAt.getTime(), sessionExpiry.getTime()));
    await this.signIns.createSession({
      tokenHash: session.tokenHash,
      projectId: target.projectId,
      previewId: target.previewId,
      sessionId: redeemed.sessionId,
      expiresAt,
    });
    return { token: session.token, returnPath: appReturnPath(redeemed.returnPath), expiresAt };
  }
}
