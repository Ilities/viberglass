export function ticketUrl(projectSlug: string, ticketId: string): string | null {
  const base = process.env.PLATFORM_FRONTEND_URL?.replace(/\/$/, "");
  return base ? `${base}/project/${projectSlug}/tickets/${ticketId}` : null;
}
