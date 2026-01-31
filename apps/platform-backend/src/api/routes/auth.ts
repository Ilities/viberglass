import express from "express";
import { UserDAO, type UserRecord } from "../../persistence/user/UserDAO";
import passport from "passport";
import { UserSessionDAO } from "../../persistence/user/UserSessionDAO";
import {
  validateForgotPassword,
  validateLogin,
  validateRegister,
} from "../middleware/validation";
import logger from "../../config/logger";
import { requireAuth } from "../middleware/authentication";
import type { UserRole } from "../../persistence/types/user";
import { isAuthEnabled } from "../auth/config";
import {
  clearAuthCookie,
  createSessionToken,
  getAuthToken,
  hashPassword,
  hashToken,
  normalizeEmail,
  setAuthCookie,
} from "../auth/utils";

const router = express.Router();
const userDao = new UserDAO();
const sessionDao = new UserSessionDAO();

type AuthUserPayload = {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  role: UserRole;
};

function buildAuthResponse(user: AuthUserPayload) {
  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl,
      role: user.role,
    },
  };
}

router.post("/register", validateRegister, async (req, res) => {
  try {
    const hasUsers = await userDao.hasAnyUsers();
    if (hasUsers) {
      return res.status(403).json({
        error: "User registration is disabled",
        message: "Only admins can add new users.",
      });
    }

    const email = normalizeEmail(req.body.email as string);
    const name = (req.body.name as string).trim();
    const password = req.body.password as string;

    if (!name) {
      return res.status(400).json({ error: "Name is required" });
    }

    const existingUser = await userDao.findByEmail(email);
    if (existingUser) {
      return res.status(409).json({ error: "Email already in use" });
    }

    const passwordHash = await hashPassword(password);
    const user = await userDao.createUser({
      email,
      name,
      passwordHash,
      role: "admin",
    });

    const { token, tokenHash, expiresAt } = createSessionToken();
    await sessionDao.createSession({
      userId: user.id,
      tokenHash,
      expiresAt,
    });

    setAuthCookie(res, token);
    res.status(201).json({ token, ...buildAuthResponse(user) });
  } catch (error) {
    logger.error("Error registering user", {
      error: error instanceof Error ? error.message : error,
    });
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/login", validateLogin, (req, res, next) => {
  passport.authenticate(
    "local",
    { session: false },
    async (err: unknown, user: UserRecord | false | null, info?: { message?: string }) => {
      if (err) {
        logger.error("Error logging in", {
          error: err instanceof Error ? err.message : err,
        });
        res.status(500).json({ error: "Internal server error" });
        return;
      }

      if (!user) {
        res.status(401).json({ error: info?.message ?? "Invalid email or password" });
        return;
      }

      try {
        const { token, tokenHash, expiresAt } = createSessionToken();
        await sessionDao.createSession({
          userId: user.id,
          tokenHash,
          expiresAt,
        });

        setAuthCookie(res, token);
        res.json({ token, ...buildAuthResponse(user) });
      } catch (error) {
        logger.error("Error logging in", {
          error: error instanceof Error ? error.message : error,
        });
        res.status(500).json({ error: "Internal server error" });
      }
    },
  )(req, res, next);
});

router.get("/me", requireAuth, (req, res) => {
  if (!isAuthEnabled()) {
    res.json(
      buildAuthResponse({
        id: "auth-disabled",
        email: "auth-disabled@local",
        name: "Auth Disabled",
        avatarUrl: null,
        role: "admin",
      }),
    );
    return;
  }

  res.json(buildAuthResponse(req.auth!.user));
});

router.post("/logout", async (req, res) => {
  try {
    const token = getAuthToken(req);
    if (token) {
      await sessionDao.revokeSession(hashToken(token));
    }

    clearAuthCookie(res);
    res.json({ success: true });
  } catch (error) {
    logger.error("Error logging out", {
      error: error instanceof Error ? error.message : error,
    });
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/forgot-password", validateForgotPassword, async (req, res) => {
  const email = normalizeEmail(req.body.email as string);
  logger.info("Password reset requested", { email });
  res.status(202).json({
    success: true,
    message: "If the email exists, a reset link will be sent.",
  });
});

export default router;
