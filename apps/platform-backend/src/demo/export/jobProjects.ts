import { idValue, type Row } from "../bundle/jsonValues";

type RowsOf = (table: string) => Row[];

/** Each job's space, from its run manifest, task, release or schedule. */
export function jobProjects(rowsOf: RowsOf): Map<string, string> {
  const projects = new Map<string, string>();
  const note = (jobId: string | null, projectId: string | null | undefined) => {
    if (jobId && projectId && !projects.has(jobId)) projects.set(jobId, projectId);
  };

  for (const manifest of rowsOf("job_run_manifests")) note(idValue(manifest, "job_id"), idValue(manifest, "project_id"));

  const ticketProjects = new Map(rowsOf("tickets").map((ticket) => [idValue(ticket, "id"), idValue(ticket, "project_id")]));
  for (const job of rowsOf("jobs")) note(idValue(job, "id"), ticketProjects.get(idValue(job, "ticket_id")));

  for (const release of rowsOf("app_releases")) note(idValue(release, "job_id"), idValue(release, "project_id"));

  const scheduleProjects = new Map(rowsOf("claw_schedules").map((schedule) => [idValue(schedule, "id"), idValue(schedule, "project_id")]));
  for (const execution of rowsOf("claw_executions")) note(idValue(execution, "job_id"), scheduleProjects.get(idValue(execution, "schedule_id")));

  return projects;
}
