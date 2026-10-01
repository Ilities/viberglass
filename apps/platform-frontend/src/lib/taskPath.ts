/** A task's page, addressed by its key (WEB-42) when it has one. */
export function taskPath(space: string, task: { id: string; key?: string }): string {
  return `/spaces/${space}/tasks/${task.key ?? task.id}`
}
