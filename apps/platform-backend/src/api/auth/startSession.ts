import type { Response } from "express";
import { UserSessionDAO } from "../../persistence/user/UserSessionDAO";
import { createSessionToken, setAuthCookie } from "./utils";

/** Signs a person in: a new session, and its cookie on the response. Returns the session token. */
export async function startSession(
  res: Response,
  userId: string,
  sessions: Pick<UserSessionDAO, "createSession"> = new UserSessionDAO(),
): Promise<string> {
  const { token, tokenHash, expiresAt } = createSessionToken();
  await sessions.createSession({ userId, tokenHash, expiresAt });
  setAuthCookie(res, token);
  return token;
}
