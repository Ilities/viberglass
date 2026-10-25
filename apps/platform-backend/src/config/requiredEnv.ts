const DATABASE_VARIABLES = ["DB_HOST", "DB_PORT", "DB_NAME", "DB_USER", "DB_PASSWORD"] as const;
const ENCRYPTION_KEY_VARIABLES = ["SECRETS_ENCRYPTION_KEY", "WEBHOOK_SECRET_ENCRYPTION_KEY"] as const;

function isSet(source: NodeJS.ProcessEnv, name: string): boolean {
  return Boolean(source[name]?.trim());
}

/**
 * The required settings that are absent, one report line each. Empty means the
 * process can start. DATABASE_URL replaces the DB_* group; it does not combine
 * with it, so a partly filled DB_* group is still incomplete.
 */
export function validateRequiredEnv(source: NodeJS.ProcessEnv = process.env): string[] {
  const missing: string[] = [];

  if (!isSet(source, "DATABASE_URL")) {
    const missingDatabase = DATABASE_VARIABLES.filter((name) => !isSet(source, name));
    if (missingDatabase.length > 0) {
      missing.push(`${missingDatabase.join(", ")} (or DATABASE_URL)`);
    }
  }

  for (const name of ENCRYPTION_KEY_VARIABLES) {
    if (!isSet(source, name)) missing.push(name);
  }

  // Unit tests build links and cookies without a frontend origin to point at.
  if (source.NODE_ENV !== "test" && !isSet(source, "PLATFORM_FRONTEND_URL")) {
    missing.push("PLATFORM_FRONTEND_URL");
  }

  return missing;
}

export function reportMissingRequiredEnv(missing: string[]): void {
  console.error(["Missing required environment variables:", ...missing.map((line) => `- ${line}`)].join("\n"));
}
