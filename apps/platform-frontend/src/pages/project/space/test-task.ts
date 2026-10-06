import type { TaskSituation, Ticket } from '@viberglass/types'

/** A task for the space page's tests: open, not started, with the situation and fields given. */
export function testTask(id: string, situation: Partial<TaskSituation> = {}, extra: Partial<Ticket> = {}): Ticket {
  const at = '2026-10-01T00:00:00.000Z'
  return {
    id,
    key: `WEB-${id}`,
    projectId: 'space-1',
    timestamp: at,
    title: `Task ${id}`,
    description: '',
    severity: 'medium',
    category: 'General',
    status: 'open',
    workflowPhase: 'planning',
    metadata: { timestamp: at, timezone: 'UTC' },
    annotations: [],
    ticketSystem: 'custom',
    autoFixRequested: false,
    createdAt: at,
    updatedAt: at,
    situation: { state: 'not_started', label: 'Not started', waitingOn: { kind: 'nobody' }, since: at, yourMove: false, ...situation },
    ...extra,
  }
}
