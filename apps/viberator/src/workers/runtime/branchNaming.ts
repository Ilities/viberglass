export function buildFeatureBranchName(
  jobId: string,
  ticketId: string | undefined,
  originalTicketId: string | undefined,
  clankerId: string | undefined,
  template: string | null | undefined,
): string {
  const defaultTemplate = `viberator/{{ ticketId }}`;
  const effectiveTemplate =
    template && template.trim().length > 0 ? template : defaultTemplate;

  const now = new Date();
  const replacements = {
    jobId,
    ticketId: ticketId || jobId,
    ticket: ticketId || jobId,
    original_ticket: originalTicketId || ticketId || jobId,
    originalTicket: originalTicketId || ticketId || jobId,
    clanker: clankerId || "unknown-clanker",
    clankerId: clankerId || "unknown-clanker",
    timestamp: now.toISOString().replace(/[-:.TZ]/g, ""),
    date: now.toISOString().slice(0, 10),
  };

  const rendered = effectiveTemplate.replace(
    /\{\{\s*(jobId|ticketId|ticket|original_ticket|originalTicket|clanker|clankerId|timestamp|date)\s*\}\}/g,
    (_match, token: keyof typeof replacements) => replacements[token],
  );
  const sanitized = sanitizeBranchName(rendered);
  return sanitized || `viberator/${jobId}`;
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
