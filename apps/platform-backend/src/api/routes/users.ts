import express from "express";
import { UserDAO, type PublicUser } from "../../persistence/user/UserDAO";
import {
  validateCreateUser,
  validateUpdateUserRole,
  validateUuidParam,
} from "../middleware/validation";
import { requireAuth, requireRole } from "../middleware/authentication";
import type { UserRole } from "../../persistence/types/user";
import { hashPassword, normalizeEmail } from "../auth/utils";
import logger from "../../config/logger";
import { UserActivationService } from "../../services/people/UserActivationService";
import { PasswordResetService } from "../../services/people/PasswordResetService";

const router = express.Router();
const userDao = new UserDAO();
const userActivation = new UserActivationService(userDao);
const passwordResets = new PasswordResetService();

function buildUserResponse(user: PublicUser) {
  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl,
      role: user.role,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      deactivatedAt: user.deactivatedAt,
    },
  };
}

function buildUsersResponse(users: PublicUser[]) {
  return {
    users: users.map((user) => ({
      id: user.id,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl,
      role: user.role,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      deactivatedAt: user.deactivatedAt,
    })),
  };
}

// Names for the people who appear on tasks, comments and sessions. Any
// signed-in user may read it; roles and dates stay admin-only.
router.get("/directory", requireAuth, async (_req, res) => {
  try {
    const users = await userDao.listUsers();
    res.json({
      people: users.map(({ id, email, name, avatarUrl }) => ({ id, email, name, avatarUrl })),
    });
  } catch (error) {
    logger.error("Error listing the people directory", {
      error: error instanceof Error ? error.message : error,
    });
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/", requireRole("admin"), async (_req, res) => {
  try {
    const users = await userDao.listUsers();
    res.json(buildUsersResponse(users));
  } catch (error) {
    logger.error("Error listing users", {
      error: error instanceof Error ? error.message : error,
    });
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch(
  "/:id/role",
  requireRole("admin"),
  validateUuidParam("id"),
  validateUpdateUserRole,
  async (req, res) => {
    try {
      const targetUser = await userDao.findById(req.params.id);
      if (!targetUser) {
        return res.status(404).json({ error: "User not found" });
      }

      const role = req.body.role as UserRole;
      if (targetUser.role === role) {
        return res.json(buildUserResponse(targetUser));
      }

      if (targetUser.role === "admin" && role !== "admin" && !targetUser.deactivatedAt) {
        const adminCount = await userDao.countActiveAdmins();
        if (adminCount <= 1) {
          return res.status(400).json({
            error: "At least one admin is required",
          });
        }
      }

      const updatedUser = await userDao.updateUserRole(targetUser.id, role);
      if (!updatedUser) {
        return res.status(404).json({ error: "User not found" });
      }

      res.json(buildUserResponse(updatedUser));
    } catch (error) {
      logger.error("Error updating user role", {
        error: error instanceof Error ? error.message : error,
      });
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

router.post("/:id/deactivate", requireRole("admin"), validateUuidParam("id"), async (req, res, next) => {
  try {
    const user = await userActivation.deactivate(req.params.id, req.authContext!.user.id);
    res.json(buildUserResponse(user));
  } catch (error) {
    next(error);
  }
});

router.post("/:id/reactivate", requireRole("admin"), validateUuidParam("id"), async (req, res, next) => {
  try {
    res.json(buildUserResponse(await userActivation.reactivate(req.params.id)));
  } catch (error) {
    next(error);
  }
});

// The link is returned only here; only its hash is stored.
router.post("/:id/reset-link", requireRole("admin"), validateUuidParam("id"), async (req, res, next) => {
  try {
    const token = await passwordResets.createLink(req.params.id, req.authContext!.user.id);
    res.status(201).json({ path: `/reset-password/${token}` });
  } catch (error) {
    next(error);
  }
});

router.post("/", requireRole("admin"), validateCreateUser, async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email as string);
    const name = (req.body.name as string).trim();
    const password = req.body.password as string;
    const role = (req.body.role as UserRole | undefined) ?? "member";

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
      role,
    });

    res.status(201).json(buildUserResponse(user));
  } catch (error) {
    logger.error("Error creating user", {
      error: error instanceof Error ? error.message : error,
    });
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
