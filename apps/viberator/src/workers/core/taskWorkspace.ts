import path from "path";

/**
 * The folder a job clones into. Every turn of a task uses the same one, because
 * most harnesses file their sessions under the working directory's path and
 * can't resume from another. Jobs without a task (scheduled runs) keep a folder
 * of their own.
 */
export function jobWorkspaceDir(repositoryRoot: string, job: { id: string; context?: { ticketId?: string } }): string {
  const ticketId = job.context?.ticketId?.trim();
  const name = ticketId ? `task-${ticketId}` : job.id;
  // Ids come from the platform; keep them to one safe path segment all the same.
  const segment = name.replace(/[^A-Za-z0-9._-]/g, "_");
  return path.join(repositoryRoot, /^\.+$/.test(segment) ? "_" : segment);
}
