import dotenv from "dotenv";
import path from "path";
import { LogLevel } from "@slack/bolt";
import {
  createDynamoInstallationStore,
  createFileInstallationStore,
} from "./installationStore";

dotenv.config();

const DEFAULT_SCOPES = [
  "chat:write",
  "commands",
  "app_mentions:read",
  "channels:read",
  "groups:read",
  "im:read",
  "mpim:read",
];

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function parseScopes(value: string | undefined): string[] {
  if (!value) {
    return DEFAULT_SCOPES;
  }

  return value
    .split(",")
    .map((scope) => scope.trim())
    .filter((scope) => scope.length > 0);
}

export function resolveLogLevel(value: string | undefined): LogLevel {
  switch ((value || "info").toLowerCase()) {
    case "debug":
      return LogLevel.DEBUG;
    case "warn":
      return LogLevel.WARN;
    case "error":
      return LogLevel.ERROR;
    default:
      return LogLevel.INFO;
  }
}

export function createInstallationStore() {
  const tableName = process.env.SLACK_INSTALLATION_STORE_TABLE;
  if (tableName) {
    return createDynamoInstallationStore({
      tableName,
    });
  }

  const storePath =
    process.env.SLACK_INSTALLATION_STORE_PATH ||
    path.join(process.cwd(), "data", "slack-installations.json");

  return createFileInstallationStore({ storePath });
}

export function getReceiverConfig() {
  return {
    signingSecret: requireEnv("SLACK_SIGNING_SECRET"),
    clientId: requireEnv("SLACK_CLIENT_ID"),
    clientSecret: requireEnv("SLACK_CLIENT_SECRET"),
    stateSecret: requireEnv("SLACK_STATE_SECRET"),
    scopes: parseScopes(process.env.SLACK_SCOPES),
    installationStore: createInstallationStore(),
    installerOptions: {
      directInstall: true,
    },
  };
}
