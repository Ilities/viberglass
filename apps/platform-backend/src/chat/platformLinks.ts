export function ticketUrl(projectId: string, ticketId: string): string | null {
  const base = process.env.PLATFORM_FRONTEND_URL?.replace(/\/$/, "");
  return base ? `${base}/project/${projectId}/tickets/${ticketId}` : null;
}
