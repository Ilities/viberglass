import { isObjectRecord } from "@viberglass/types";

export interface GitHubPersona {
  login: string;
  name: string;
  avatarUrl: string | null;
}

export interface ExportConfig {
  emailDomain: string;
  /** Source address to exported address; everyone else gets their first name at `emailDomain`. */
  emails: Record<string, string>;
  /** Source addresses of people left out, such as the admin who ran the capture. */
  excludeUsers: string[];
  /** Task keys left out with everything that belongs to them. */
  excludeTasks: string[];
  /** Job ids left out with what they produced; their tasks stay. */
  excludeJobs: string[];
  /** Space slugs to export; null exports every space. */
  spaces: string[] | null;
  viewer: {
    /** A source person who becomes the shared viewer, keeping what they watch and where they're mentioned. */
    sourceEmail: string | null;
    watchTaskKeys: string[];
  };
  /** GitHub logins whose actions show as a persona instead, such as the account whose token the capture used. */
  githubAccounts: Record<string, GitHubPersona>;
  /** Exact matches the secret scan reported and someone checked are harmless. */
  allowedFindings: string[];
}

export const DEFAULT_EXPORT_CONFIG: ExportConfig = {
  emailDomain: "acme.invalid",
  emails: {},
  excludeUsers: [],
  excludeTasks: [],
  excludeJobs: [],
  spaces: null,
  viewer: { sourceEmail: null, watchTaskKeys: [] },
  githubAccounts: {},
  allowedFindings: [],
};

const strings = (value: unknown, name: string): string[] => {
  if (value === undefined) return [];
  if (!Array.isArray(value) || !value.every((item): item is string => typeof item === "string")) {
    throw new Error(`${name} must be a list of strings`);
  }
  return value;
};

function emails(value: unknown): Record<string, string> {
  if (value === undefined) return {};
  if (!isObjectRecord(value)) throw new Error("emails must map source addresses to exported ones");
  const mapping: Record<string, string> = {};
  for (const [from, to] of Object.entries(value)) {
    if (typeof to !== "string") throw new Error(`emails.${from} must be an address`);
    mapping[from] = to;
  }
  return mapping;
}

const loginFromName = (name: string): string => name.toLowerCase().replace(/[^a-z0-9-]/g, "");

function githubAccounts(value: unknown): Record<string, GitHubPersona> {
  if (value === undefined) return {};
  if (!isObjectRecord(value)) throw new Error("githubAccounts must map source logins to personas");
  const accounts: Record<string, GitHubPersona> = {};
  for (const [from, persona] of Object.entries(value)) {
    if (!isObjectRecord(persona) || typeof persona.name !== "string" || persona.name.trim() === "") {
      throw new Error(`githubAccounts.${from} needs a name`);
    }
    if (persona.login !== undefined && typeof persona.login !== "string") throw new Error(`githubAccounts.${from}.login must be a string`);
    if (persona.avatarUrl !== undefined && typeof persona.avatarUrl !== "string") throw new Error(`githubAccounts.${from}.avatarUrl must be a string`);
    const login = persona.login ?? loginFromName(persona.name);
    if (!login) throw new Error(`githubAccounts.${from} needs a login`);
    accounts[from] = { login, name: persona.name, avatarUrl: persona.avatarUrl ?? null };
  }
  return accounts;
}

export function parseExportConfig(value: unknown): ExportConfig {
  if (!isObjectRecord(value)) throw new Error("The export config must be a JSON object");
  const viewer = isObjectRecord(value.viewer) ? value.viewer : {};
  if (value.emailDomain !== undefined && typeof value.emailDomain !== "string") throw new Error("emailDomain must be a string");
  if (viewer.sourceEmail !== undefined && typeof viewer.sourceEmail !== "string") throw new Error("viewer.sourceEmail must be a string");
  const excludeTasks = strings(value.excludeTasks, "excludeTasks");
  const watchTaskKeys = strings(viewer.watchTaskKeys, "viewer.watchTaskKeys");
  const watchedButExcluded = watchTaskKeys.filter((key) => excludeTasks.includes(key));
  if (watchedButExcluded.length > 0) throw new Error(`viewer.watchTaskKeys names excluded tasks: ${watchedButExcluded.join(", ")}`);
  return {
    emailDomain: value.emailDomain ?? DEFAULT_EXPORT_CONFIG.emailDomain,
    emails: emails(value.emails),
    excludeUsers: strings(value.excludeUsers, "excludeUsers"),
    excludeTasks,
    excludeJobs: strings(value.excludeJobs, "excludeJobs"),
    spaces: value.spaces === undefined ? null : strings(value.spaces, "spaces"),
    viewer: { sourceEmail: viewer.sourceEmail ?? null, watchTaskKeys },
    githubAccounts: githubAccounts(value.githubAccounts),
    allowedFindings: strings(value.allowedFindings, "allowedFindings"),
  };
}
