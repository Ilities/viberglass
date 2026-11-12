import { withPlainMentions } from "@viberglass/types";
import { idValue, mapStrings, textValue, type Row } from "../bundle/jsonValues";
import type { ForbiddenValue } from "./SecretScanner";

const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** How a turn prompt quotes a message's body inside its thread. */
const quotedBody = (body: string): string => withPlainMentions(body).trim().replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * Takes left-out messages out of the threads that later turn prompts quoted,
 * and names their text so the secret scan stops an export that still shows it.
 */
export class ExcludedMessageRepair {
  private readonly bodies: readonly string[];
  private readonly pattern: RegExp | null;

  constructor(bodies: readonly string[]) {
    this.bodies = bodies.map((body) => body.trim()).filter((body) => body !== "");
    const quoted = this.bodies.map((body) => escapeRegExp(quotedBody(body)));
    this.pattern = quoted.length > 0 ? new RegExp(`<message[^>\\n]*>\\n(?:${quoted.join("|")})\\n</message>\\n?`, "g") : null;
  }

  static from(messages: readonly Row[], excludedIds: ReadonlySet<string>): ExcludedMessageRepair {
    return new ExcludedMessageRepair(
      messages.flatMap((row) => {
        const body = textValue(row, "body_markdown");
        return excludedIds.has(idValue(row, "id") ?? "") && body !== null ? [body] : [];
      }),
    );
  }

  repair(_table: string, rows: readonly Row[]): Row[] {
    const pattern = this.pattern;
    if (!pattern) return [...rows];
    const strip = (text: string): string => text.replace(pattern, "");
    return rows.map((row) => Object.fromEntries(Object.entries(row).map(([column, value]) => [column, mapStrings(value, strip)])));
  }

  forbiddenValues(): ForbiddenValue[] {
    return this.bodies.flatMap((body) => [...new Set([body, quotedBody(body)])].map((value) => ({ kind: "a left-out message", value })));
  }
}
