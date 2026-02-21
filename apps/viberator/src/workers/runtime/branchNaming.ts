export function buildFeatureBranchName(
  jobId: string,
  ticketId: string | undefined,
  template: string | null | undefined,
): string {
  const fallback = `fix/${jobId}`;
  if (!template || template.trim().length === 0) {
    return fallback;
  }

  const now = new Date();
  const replacements = {
    jobId,
    ticketId: ticketId || jobId,
    timestamp: now.toISOString().replace(/[-:.TZ]/g, ""),
    date: now.toISOString().slice(0, 10),
  };

  const rendered = template.replace(
    /\{\{\s*(jobId|ticketId|timestamp|date)\s*\}\}/g,
    (_match, token: keyof typeof replacements) => replacements[token],
  );
  const sanitized = sanitizeBranchName(rendered);
  return sanitized || fallback;
}

function sanitizeBranchName(candidate: string): string {
  return candidate
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9/_\-.]/g, "-")
    .replace(/\/{2,}/g, "/")
    .replace(/^\/+|\/+$/g, "")
    .replace(/^\.+/, "")
    .replace(/\.lock$/i, "");
}
