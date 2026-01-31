import express from "express";
import { UserDAO } from "../../persistence/user/UserDAO";
import { validateCreateUser } from "../middleware/validation";
import { requireRole } from "../middleware/authentication";
import type { UserRole } from "../../persistence/types/user";
import { hashPassword, normalizeEmail } from "../auth/utils";
import logger from "../../config/logger";

const router = express.Router();
const userDao = new UserDAO();

type CreateUserPayload = {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  role: UserRole;
};

function buildUserResponse(user: CreateUserPayload) {
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
