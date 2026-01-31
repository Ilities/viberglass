import { createHash, randomBytes, scrypt, timingSafeEqual } from "crypto";
import { promisify } from "util";
import type { Request, Response } from "express";

const scryptAsync = promisify(scrypt);

export const SESSION_TTL_MS =
  parseInt(process.env.AUTH_SESSION_TTL_MS || "", 10) ||
  7 * 24 * 60 * 60 * 1000;
export const AUTH_COOKIE_NAME = "auth_token";

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derivedKey = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${salt.toString("hex")}:${derivedKey.toString("hex")}`;
}

export async function verifyPassword(
  password: string,
  storedHash: string,
): Promise<boolean> {
  const [saltHex, hashHex] = storedHash.split(":");
  if (!saltHex || !hashHex) {
    return false;
  }

  const salt = Buffer.from(saltHex, "hex");
  const hash = Buffer.from(hashHex, "hex");
  const derivedKey = (await scryptAsync(password, salt, hash.length)) as Buffer;

  return timingSafeEqual(hash, derivedKey);
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function createSessionToken(): {
  token: string;
  tokenHash: string;
  expiresAt: Date;
} {
  const token = randomBytes(32).toString("hex");
  return {
    token,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + SESSION_TTL_MS),
  };
}

export function getAuthToken(req: Request): string | null {
  const header = req.get("Authorization");
  if (header?.startsWith("Bearer ")) {
    return header.slice("Bearer ".length).trim();
  }

  const cookieToken = req.cookies?.[AUTH_COOKIE_NAME];
  return cookieToken || null;
}

export function setAuthCookie(res: Response, token: string): void {
  res.cookie(AUTH_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_TTL_MS,
    path: "/",
  });
}

export function clearAuthCookie(res: Response): void {
  res.clearCookie(AUTH_COOKIE_NAME, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });
}
