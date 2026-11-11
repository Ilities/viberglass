import { eachString, isPlainRecord, type Row } from "../bundle/jsonValues";
import type { GitHubPersona } from "./exportConfig";

const NAME_KEYS = new Set(["name", "displayName", "display_name", "authorName", "author_name", "fullName", "full_name"]);
const AVATAR_KEYS = new Set(["avatarUrl", "avatar_url", "avatar"]);

const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Shows a GitHub account's actions as a persona: a value that is the login
 * becomes the persona's login (or name, under a name key), an avatar beside it
 * becomes the persona's, and the login in text becomes the persona's name, or
 * `@login` for a mention. Links and `owner/repo` paths keep the real login.
 */
export class GitHubAccountMapping {
  private readonly personas: ReadonlyMap<string, GitHubPersona>;
  private readonly pattern: RegExp | null;
  private readonly detect: RegExp | null;

  constructor(accounts: Readonly<Record<string, GitHubPersona>>) {
    this.personas = new Map(Object.entries(accounts).map(([login, persona]) => [login.toLowerCase(), persona]));
    const logins = [...this.personas.keys()].sort((a, b) => b.length - a.length).map(escapeRegExp);
    this.pattern = logins.length > 0 ? new RegExp(`(?<![\\w/.@-])(@?)(${logins.join("|")})(?![\\w/-])`, "gi") : null;
    this.detect = this.pattern ? new RegExp(this.pattern.source, "i") : null;
  }

  repair(_table: string, rows: readonly Row[]): Row[] {
    return rows.map((row) => (this.mentions(row) ? this.record(row) : row));
  }

  private mentions(row: Row): boolean {
    const detect = this.detect;
    if (!detect) return false;
    let found = false;
    eachString(row, (text) => {
      if (!found && detect.test(text)) found = true;
    });
    return found;
  }

  private record(value: Record<string, unknown>): Record<string, unknown> {
    const persona = Object.values(value).map((item) => this.personaOf(item)).find((item) => item !== null) ?? null;
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, persona && AVATAR_KEYS.has(key) ? persona.avatarUrl : this.value(item, key)]),
    );
  }

  private value(value: unknown, key: string | null): unknown {
    if (typeof value === "string") {
      const persona = this.personaOf(value);
      if (persona) return key !== null && NAME_KEYS.has(key) ? persona.name : persona.login;
      return this.text(value);
    }
    if (Array.isArray(value)) return value.map((item) => this.value(item, null));
    if (isPlainRecord(value)) return this.record(value);
    return value;
  }

  private personaOf(value: unknown): GitHubPersona | null {
    return typeof value === "string" ? (this.personas.get(value.toLowerCase()) ?? null) : null;
  }

  private text(value: string): string {
    const pattern = this.pattern;
    if (!pattern) return value;
    return value.replace(pattern, (match: string, at: string, login: string) => {
      const persona = this.personas.get(login.toLowerCase());
      if (!persona) return match;
      return at ? `@${persona.login}` : persona.name;
    });
  }
}
