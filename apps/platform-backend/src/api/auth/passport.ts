import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Strategy as CustomStrategy } from "passport-custom";
import { UserDAO } from "../../persistence/user/UserDAO";
import { UserSessionDAO } from "../../persistence/user/UserSessionDAO";
import {
  getAuthToken,
  hashToken,
  normalizeEmail,
  verifyPassword,
} from "./utils";
import type { AuthContext } from "./context";

const userDao = new UserDAO();
const sessionDao = new UserSessionDAO();

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
}
