import type { InboundWebhookAction, WebhookReadSettings } from '@viberglass/integration-core'
import { asanaRequest, type AsanaConfig } from '../asanaApi'
import { readAsanaEvent } from './readAsanaEvent'
import type { AsanaEvent, AsanaStory, AsanaTask } from './asanaWebhookTypes'

const TASK_FIELDS = 'gid,name,notes,permalink_url,completed,created_by.gid,created_by.name,tags.name,memberships.project.gid'
const STORY_FIELDS = 'gid,resource_subtype,text,created_by.gid,created_by.name,target.gid,task.gid'

/** Expands Asana's compact event records with the API resource state. */
export class AsanaEventReader {
  constructor(
    private readonly config: AsanaConfig,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly resourceReader?: (event: AsanaEvent, settings: WebhookReadSettings) => Promise<InboundWebhookAction>,
  ) {}

  async readBatch(events: AsanaEvent[], settings: WebhookReadSettings): Promise<InboundWebhookAction[]> {
    const actions: InboundWebhookAction[] = []
    const deduped = new Set<string>()
    const loadedTasks = new Map<string, AsanaTask>()
    for (const event of events) {
      const resourceType = event.resource?.resource_type
      if (resourceType !== 'task' && resourceType !== 'story') continue
      if (event.action !== 'added' && event.action !== 'changed') continue
      if (event.resource?.resource_type === 'task' && event.action === 'changed' && event.change?.field === 'modified_at') {
        const storyId = event.story?.gid
        if (!storyId) continue
        const storyAction = await this.readResource({ ...event, resource: { gid: storyId, resource_type: 'story' }, action: 'added' }, settings, loadedTasks)
        if (storyAction.kind === 'comment' && !deduped.has(storyId)) {
          deduped.add(storyId)
          actions.push(storyAction)
        }
        continue
      }
      let action = await this.readResource(event, settings, loadedTasks)
      if (action.kind === 'comment') {
        const storyId = event.resource?.gid
        if (storyId && deduped.has(storyId)) continue
        if (storyId) deduped.add(storyId)
      }
      if (action.kind === 'issue') {
        const projectId = event.parent?.resource_type === 'project' ? event.parent.gid : undefined
        const projectIds = Array.isArray(action.issue.metadata.projectIds)
          ? action.issue.metadata.projectIds.filter((id): id is string => typeof id === 'string')
          : []
        if (projectId && !projectIds.includes(projectId)) projectIds.push(projectId)
        if (event.action === 'added' && event.parent?.resource_type === 'project') {
          projectIds.splice(0, projectIds.length)
          if (event.parent.gid) projectIds.push(event.parent.gid)
        }
        const stateChange = event.change?.field === 'completed'
          ? event.change.new_value === true ? 'closed' : event.change.new_value === false ? 'reopened' : undefined
          : undefined
        action = {
          ...action,
          issue: {
            ...action.issue,
            metadata: { ...action.issue.metadata, projectIds, projectId: projectIds[0] ?? null },
            ...(stateChange ? { stateChange } : {}),
          },
        }
      }
      actions.push(action)
    }
    if (actions.length === 0) return [{ kind: 'ignored', reason: 'Asana webhook batch contains no supported task or comment events' }]
    return actions
  }

  private async readResource(event: AsanaEvent, settings: WebhookReadSettings, loadedTasks: Map<string, AsanaTask>): Promise<InboundWebhookAction> {
    const action = this.resourceReader
      ? await this.resourceReader(event, settings)
      : await this.readResourceFromApi(event, settings, loadedTasks)
    return action
  }

  private async readResourceFromApi(event: AsanaEvent, settings: WebhookReadSettings, loadedTasks: Map<string, AsanaTask>): Promise<InboundWebhookAction> {
    const resourceId = event.resource?.gid
    const resourceType = event.resource?.resource_type
    if (!resourceId || !resourceType) return { kind: 'ignored', reason: 'Asana event has no resource' }
    if (resourceType === 'task') {
      const task = await asanaRequest(this.config,
        `/tasks/${encodeURIComponent(resourceId)}?opt_fields=${TASK_FIELDS}`, this.fetchImpl)
      const asanaTask = asAsanaTask(task.data)
      loadedTasks.set(resourceId, asanaTask)
      return readAsanaEvent(event, asanaTask, settings)
    }
    const story = await asanaRequest(this.config,
      `/stories/${encodeURIComponent(resourceId)}?opt_fields=${STORY_FIELDS}`, this.fetchImpl)
    const asanaStory = asAsanaStory(story.data)
    if (asanaStory.resource_subtype !== 'comment_added') return { kind: 'ignored', reason: 'Asana story is not a comment' }
    const taskId = asanaStory.target?.gid ?? asanaStory.task?.gid ?? event.parent?.gid
    if (!taskId) return { kind: 'ignored', reason: 'Asana comment has no parent task' }
    if (!loadedTasks.has(taskId)) {
      const task = await asanaRequest(this.config,
        `/tasks/${encodeURIComponent(taskId)}?opt_fields=${TASK_FIELDS}`, this.fetchImpl)
      loadedTasks.set(taskId, asAsanaTask(task.data))
    }
    return readAsanaEvent(event, { ...asanaStory, task: { gid: taskId } }, settings)
  }
}

function asAsanaTask(data: object): AsanaTask {
  const record = toRecord(data)
  const gid = record.get('gid')
  if (typeof gid !== 'string') throw new Error('Asana task response has no GID')
  const memberships = record.get('memberships')
  const tags = record.get('tags')
  const createdBy = record.get('created_by')
  return {
    gid,
    name: stringValue(record.get('name')),
    notes: stringValue(record.get('notes')),
    permalink_url: stringValue(record.get('permalink_url')),
    completed: booleanValue(record.get('completed')),
    memberships: Array.isArray(memberships) ? memberships.filter(isMembership) : undefined,
    tags: Array.isArray(tags) ? tags.filter(isNamedObject) : undefined,
    created_by: authorOf(createdBy),
  }
}

function asAsanaStory(data: object): AsanaStory {
  const record = toRecord(data)
  const gid = record.get('gid')
  if (typeof gid !== 'string') throw new Error('Asana story response has no GID')
  const createdBy = record.get('created_by')
  const target = record.get('target')
  const task = record.get('task')
  return {
    gid,
    resource_subtype: stringValue(record.get('resource_subtype')),
    text: stringValue(record.get('text')),
    created_by: authorOf(createdBy),
    target: refOf(target),
    task: refOf(task),
  }
}

function isNamedObject(value: unknown): value is { gid?: string; name?: string } {
  if (typeof value !== 'object' || value === null) return false
  const record = toRecord(value)
  const gid = record.get('gid')
  const name = record.get('name')
  return (gid === undefined || typeof gid === 'string') && (name === undefined || typeof name === 'string')
}

function toRecord(value: object): Map<string, unknown> {
  return new Map(Object.entries(value))
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function booleanValue(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined
}

function hasStringName(value: unknown): value is { gid?: string; name: string } {
  if (!isNamedObject(value)) return false
  return typeof toRecord(value).get('name') === 'string'
}

function authorOf(value: unknown): { gid?: string; name: string } | undefined {
  if (!hasStringName(value) || typeof value !== 'object' || value === null) return undefined
  const record = toRecord(value)
  const gid = record.get('gid')
  const name = record.get('name')
  return { ...(typeof gid === 'string' ? { gid } : {}), name: typeof name === 'string' ? name : '' }
}

function refOf(value: unknown): { gid?: string } | undefined {
  if (!isNamedObject(value) || typeof value !== 'object' || value === null) return undefined
  const gid = toRecord(value).get('gid')
  return typeof gid === 'string' ? { gid } : {}
}

function isMembership(value: unknown): value is { project?: { gid?: string } } {
  if (typeof value !== 'object' || value === null) return false
  const project = toRecord(value).get('project')
  if (!isNamedObject(project) || typeof project !== 'object' || project === null) return false
  const gid = toRecord(project).get('gid')
  return gid === undefined || typeof gid === 'string'
}
