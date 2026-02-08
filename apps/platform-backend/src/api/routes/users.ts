import express from "express";
import { UserDAO, type PublicUser } from "../../persistence/user/UserDAO";
import {
  validateCreateUser,
  validateUpdateUserRole,
  validateUuidParam,
} from "../middleware/validation";
import { requireRole } from "../middleware/authentication";
import type { UserRole } from "../../persistence/types/user";
import { hashPassword, normalizeEmail } from "../auth/utils";
import logger from "../../config/logger";

const router = express.Router();
const userDao = new UserDAO();

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
    })),
  };
}

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

      if (targetUser.role === "admin" && role === "member") {
        const adminCount = await userDao.countByRole("admin");
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
