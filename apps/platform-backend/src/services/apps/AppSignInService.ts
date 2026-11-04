import type { AppHandoff, WorkspaceRole } from "@viberglass/types";
import { createSingleUseToken, hashToken } from "../../api/auth/utils";
import type { AppDAO } from "../../persistence/apps/AppDAO";
import type { AppSignInDAO } from "../../persistence/apps/AppSignInDAO";
import type { AppSpaceDAO } from "../../persistence/apps/AppSpaceDAO";
import type { AppAccess } from "./AppAccess";
import type { AppOrigins } from "./AppOrigins";
import { appReturnPath } from "./appReturnPath";
import { AppSpaceError } from "./AppSpaceError";

const CODE_TTL_MS = 60_000;
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

export const APP_CALLBACK_PATH = "/_viberglass/callback";

export interface AppSignInViewer {
  id: string;
  role: WorkspaceRole;
  /** The Viberglass session the gateway session hangs off. */
  sessionId: string;
}

/**
 * Signing a person in to one app across origins: the frontend asks for a
 * single-use code on their behalf, and the app's host trades it for its own session.
 */
export class AppSignInService {
  constructor(
    private readonly spaces: Pick<AppSpaceDAO, "findBySlug">,
    private readonly apps: Pick<AppDAO, "get">,
    private readonly access: Pick<AppAccess, "canOpen" | "maintainerNames">,
    private readonly signIns: Pick<AppSignInDAO, "createCode" | "redeemCode" | "createSession" | "userSessionExpiry" | "deleteExpired">,
    private readonly origins: Pick<AppOrigins, "originFor">,
  ) {}

  async handoff(viewer: AppSignInViewer, slug: string, returnPath: unknown): Promise<AppHandoff> {
    const space = await this.spaces.findBySlug(slug);
    if (!space || !(await this.access.canOpen(viewer, space))) {
      throw new AppSpaceError("APP_NOT_FOUND", "This app doesn't exist, or you don't have access to it.");
    }
    const origin = this.origins.originFor(space.slug);
    if (!origin) throw new AppSpaceError("APP_SPACES_UNAVAILABLE", "Apps aren't served on this workspace.");

    const app = await this.apps.get(space.projectId);
    if (app?.state !== "running") {
      return { status: "off", appName: space.name, maintainers: await this.access.maintainerNames(space.projectId) };
    }

    await this.signIns.deleteExpired(new Date());
    const { token, tokenHash, expiresAt } = createSingleUseToken(CODE_TTL_MS);
    await this.signIns.createCode({
      codeHash: tokenHash,
      projectId: space.projectId,
      sessionId: viewer.sessionId,
      returnPath: appReturnPath(returnPath),
      expiresAt,
    });
    return { status: "ready", url: `${origin}${APP_CALLBACK_PATH}?code=${encodeURIComponent(token)}` };
  }

  /** Trades a code for a gateway session on the app it was issued for; null when the code can't be used. */
  async redeem(slug: string, code: string): Promise<{ token: string; returnPath: string; expiresAt: Date } | null> {
    const space = await this.spaces.findBySlug(slug);
    if (!space) return null;
    const redeemed = await this.signIns.redeemCode(hashToken(code), space.projectId);
    if (!redeemed) return null;
    const sessionExpiry = await this.signIns.userSessionExpiry(redeemed.sessionId);
    if (!sessionExpiry) return null;

    const session = createSingleUseToken(SESSION_TTL_MS);
    const expiresAt = new Date(Math.min(session.expiresAt.getTime(), sessionExpiry.getTime()));
    await this.signIns.createSession({ tokenHash: session.tokenHash, projectId: space.projectId, sessionId: redeemed.sessionId, expiresAt });
    return { token: session.token, returnPath: appReturnPath(redeemed.returnPath), expiresAt };
  }
}
