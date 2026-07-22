import { randomUUID } from "crypto";

export function v4(): string {
  return randomUUID();
}
