const AUTH_DISABLED_VALUES = new Set(["0", "false", "off", "no"]);

export function isAuthEnabled(): boolean {
  const raw = process.env.AUTH_ENABLED?.toLowerCase();
  if (!raw) {
    return true;
  }
  return !AUTH_DISABLED_VALUES.has(raw);
}
