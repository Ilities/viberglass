const MAX_LENGTH = 2048;

/**
 * A path on the app's own host to land on after signing in. Anything that could
 * leave the host (`//other`, `/\other`, a scheme) becomes `/`.
 */
export function appReturnPath(value: unknown): string {
  if (typeof value !== "string" || value.length > MAX_LENGTH) return "/";
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return "/";
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f\\]/.test(value)) return "/";
  return value;
}
