import { readFileSync } from "fs";

export function loadCallbackToken(env: NodeJS.ProcessEnv = process.env): string | undefined {
  if (env.CALLBACK_TOKEN_FILE) return readFileSync(env.CALLBACK_TOKEN_FILE, "utf8").trim();
  return env.CALLBACK_TOKEN;
}
