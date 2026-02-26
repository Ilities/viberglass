import type { NextFunction, Request, Response } from "express";
import passport from "passport";
import { isAuthEnabled } from "../auth/config";
import type { UserRole } from "../../persistence/types/user";
import type { AuthContext } from "../auth/context";

export type AuthPolicy = (
  context: AuthContext,
  req: Request,
) => boolean | Promise<boolean>;

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}

type PassportInfo = { message?: string } | undefined;

type AuthOptions = {
  required: boolean;
  forbiddenMessage?: string;
  check?: (context: AuthContext, req: Request) => boolean | Promise<boolean>;
};

function getFailureMessage(info: PassportInfo, fallback: string): string {
  if (info && typeof info === "object" && "message" in info && info.message) {
    return info.message;
  }
  return fallback;
}

function authenticateRequest(options: AuthOptions) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!isAuthEnabled()) {
      // Inject mock admin user for E2E tests / local dev
      const mockUser = {
        id: "mock-user-id",
        email: "mock@example.com",
        name: "Mock Admin",
        avatarUrl: null,
        role: "admin" as const,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockSession = {
        id: "mock-session-id",
        userId: mockUser.id,
        tokenHash: "mock-token-hash",
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 86400000), // 24h
        revokedAt: null,
      };

      const mockContext: AuthContext = {
        user: mockUser,
        session: mockSession,
        roles: ["admin"],
        permissions: [],
      };

      req.auth = mockContext;
      req.user = mockContext;

      next();
      return;
    }

    passport.authenticate(
      "session-token",
      { session: false },
      async (err: unknown, user: Express.User | false | null, info?: PassportInfo) => {
        if (err) {
          next(err as Error);
          return;
        }

        if (!user) {
          if (!options.required) {
            next();
            return;
          }

          res.status(401).json({
            error: getFailureMessage(info, "Authentication required"),
          });
          return;
        }

        const context = user as AuthContext;
        req.auth = context;
        req.user = context;

        if (options.check) {
          try {
            const allowed = await options.check(context, req);
            if (!allowed) {
              res.status(403).json({
                error: options.forbiddenMessage ?? "Access denied",
              });
              return;
            }
          } catch (error) {
            next(error as Error);
            return;
          }
        }

        next();
      },
    )(req, res, next);
  };
}

export const attachAuthContext = authenticateRequest({ required: false });

export const requireAuth = authenticateRequest({ required: true });

export function requireRole(required: UserRole | UserRole[]) {
  const roles = Array.isArray(required) ? required : [required];
  return authenticateRequest({
    required: true,
    check: (context) => roles.some((role) => context.roles.includes(role)),
  });
}

export function requirePolicy(
  policy: AuthPolicy,
  options?: { forbiddenMessage?: string },
) {
  return authenticateRequest({
    required: true,
    forbiddenMessage: options?.forbiddenMessage,
    check: (context, req) => policy(context, req),
  });
}
