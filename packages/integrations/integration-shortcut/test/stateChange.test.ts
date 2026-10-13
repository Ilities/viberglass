import type { InboundWebhookAction } from '@viberglass/integration-core'
import { ShortcutWebhookReceiver } from '../src/backend/webhook/ShortcutWebhookReceiver'

const receiver = new ShortcutWebhookReceiver()
const WORKFLOW = [
  { id: 500000007, entity_type: 'workflow-state', name: 'To Do', type: 'unstarted' },
  { id: 500000008, entity_type: 'workflow-state', name: 'In Progress', type: 'started' },
  { id: 500000010, entity_type: 'workflow-state', name: 'Done', type: 'done' },
]

function storyUpdate(changes: Record<string, unknown>, references: unknown[] = WORKFLOW): InboundWebhookAction {
  const event = receiver.parseEvent(
    {
      id: 'delivery-1',
      version: 'v1',
      primary_id: 40,
      member_id: 'member-1',
      actions: [{ id: 40, entity_type: 'story', action: 'update', name: 'Add Muse Spark model', story_type: 'feature', changes }],
      references,
    },
    {},
  )
  return receiver.read(event, { botUsername: null })
}

function stateChangeOf(action: InboundWebhookAction): string | undefined {
  if (action.kind !== 'issue') throw new Error(`Expected an issue, got ${action.kind}`)
  return action.issue.stateChange
}

describe('Shortcut story closed and reopened', () => {
  it('closes the issue when the story is completed or archived', () => {
    expect(stateChangeOf(storyUpdate({ completed: { old: false, new: true } }))).toBe('closed')
    expect(stateChangeOf(storyUpdate({ archived: { old: false, new: true } }))).toBe('closed')
  })

  it('reopens it when the story is no longer completed, or is unarchived while not completed', () => {
    expect(stateChangeOf(storyUpdate({ completed: { old: true, new: false } }))).toBe('reopened')
    expect(stateChangeOf(storyUpdate({ archived: { old: true, new: false } }))).toBe('reopened')
  })

  it("reads a move into or out of a done workflow state when the update doesn't say completed", () => {
    expect(stateChangeOf(storyUpdate({ workflow_state_id: { old: 500000008, new: 500000010 } }))).toBe('closed')
    expect(stateChangeOf(storyUpdate({ workflow_state_id: { old: 500000010, new: 500000008 } }))).toBe('reopened')
    expect(stateChangeOf(storyUpdate({ workflow_state_id: { old: 500000007, new: 500000008 } }))).toBeUndefined()
    expect(stateChangeOf(storyUpdate({ workflow_state_id: { old: 500000010, new: 500000008 } }, []))).toBeUndefined()
  })

  it('leaves other changes alone', () => {
    expect(stateChangeOf(storyUpdate({ label_ids: { adds: [41] } }))).toBeUndefined()
  })
})
