import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Strategy as CustomStrategy } from "passport-custom";
import { UserDAO } from "../../persistence/user/UserDAO";
import { UserSessionDAO } from "../../persistence/user/UserSessionDAO";
import {
  ApiTokenDAO,
  hashToken as hashApiToken,
  isApiToken,
} from "../../persistence/apiToken/ApiTokenDAO";
import {
  getAuthToken,
  hashToken,
  normalizeEmail,
  verifyPassword,
} from "./utils";
import type { AuthContext } from "./context";

const userDao = new UserDAO();
const sessionDao = new UserSessionDAO();
const apiTokenDao = new ApiTokenDAO();

export function configurePassport(): void {
  passport.use(
    "local",
    new LocalStrategy(
      {
        usernameField: "email",
        passwordField: "password",
        session: false,
      },
      async (email, password, done) => {
        try {
          const normalizedEmail = normalizeEmail(email);
          const user = await userDao.findByEmail(normalizedEmail);
          if (!user) {
            return done(null, false, { message: "Invalid email or password" });
          }

          const isValid = await verifyPassword(password, user.passwordHash);
          if (!isValid) {
            return done(null, false, { message: "Invalid email or password" });
          }

          return done(null, user);
        } catch (error) {
          return done(error);
        }
      },
    ),
  );

  passport.use(
    "session-token",
    new CustomStrategy(async (req, done) => {
      try {
        const token = getAuthToken(req);
        if (!token) {
          return done(null, false, { message: "Authentication required" });
        }

        if (isApiToken(token)) {
          return done(null, false, { message: "Use API token endpoint" });
        }

        const session = await sessionDao.findValidSession(hashToken(token));
        if (!session) {
          return done(null, false, { message: "Session expired" });
        }

        const user = await userDao.findById(session.userId);
        if (!user) {
          return done(null, false, { message: "User not found" });
        }

        const context: AuthContext = {
          user,
          session,
          roles: [user.role],
          permissions: [],
        };

        return done(null, context);
      } catch (error) {
        return done(error);
      }
    }),
  );

  passport.use(
    "api-token",
    new CustomStrategy(async (req, done) => {
      try {
        const token = getAuthToken(req);
        if (!token || !isApiToken(token)) {
          return done(null, false, { message: "API token required" });
        }

        const tokenHash = hashApiToken(token);
        const tokenRecord = await apiTokenDao.findValidByHash(tokenHash);
        if (!tokenRecord) {
          return done(null, false, { message: "Invalid or expired API token" });
        }

        const user = await userDao.findById(tokenRecord.userId);
        if (!user) {
          return done(null, false, { message: "User not found" });
        }

        apiTokenDao.touchLastUsed(tokenRecord.id).catch(() => {});

        const context: AuthContext = {
          user,
          session: {
            id: tokenRecord.id,
            userId: tokenRecord.userId,
            tokenHash: tokenRecord.tokenHash,
            createdAt: tokenRecord.createdAt,
            expiresAt: tokenRecord.expiresAt ?? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
            revokedAt: null,
          },
          roles: [user.role],
          permissions: [],
        };

        return done(null, context);
      } catch (error) {
        return done(error);
      }
    }),
  );
}
