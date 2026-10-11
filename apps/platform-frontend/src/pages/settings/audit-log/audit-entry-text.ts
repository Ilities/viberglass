import { integrationLabel } from '@/integrations/integrationLabels'
import { AUDIT_ACTION_TEXT, type AuditEntry, type AuditTargetType } from '@viberglass/types'

export const AREA_LABEL: Record<AuditTargetType, string> = {
  run: 'Runs',
  approval: 'Approvals',
  connection: 'Connections',
  secret: 'Secrets',
  runner: 'Agents',
  mcp_server: 'MCP servers',
  skill: 'Skills',
  member: 'Members',
  space: 'Spaces',
  invite: 'Invites',
}

const STEP_NOUN: Record<string, string> = { planning: 'plan', execution: 'build' }

/** The chat service an entry came from, by its name, when it came from chat. */
function chatService(entry: AuditEntry): string | null {
  return typeof entry.details.via === 'string' && entry.details.via ? integrationLabel(entry.details.via) : null
}

/** "Maria approved a step"; a chat user nobody linked is named by their chat id, and the system stands in for nobody. */
export function auditSentence(entry: AuditEntry): string {
  const service = chatService(entry)
  const chatUser = service && typeof entry.details.chatUserId === 'string' ? `${service} user ${entry.details.chatUserId}` : null
  const who = entry.actor?.name ?? chatUser ?? (entry.actorKind === 'system' ? 'The system' : 'Someone who has left')
  return `${who} ${AUDIT_ACTION_TEXT[entry.action]}`
}

/** The entry's listed details in plain words; people are named through `personName`. */
export function auditDetails(entry: AuditEntry, personName: (id: string) => string): string[] {
  const text = (key: string): string | null => (typeof entry.details[key] === 'string' ? String(entry.details[key]) : null)
  const step = text('step')
  const name = text('name')
  const userId = text('userId')
  const role = text('role')
  const direction = text('direction')
  const removedFile = text('removedFile')
  const service = chatService(entry)
  const fields = Array.isArray(entry.details.fields) ? entry.details.fields.filter((field) => typeof field === 'string') : []
  return [
    step && `the ${STEP_NOUN[step] ?? step}`,
    name && `“${name}”`,
    text('email'),
    userId && personName(userId),
    role && `as ${role}`,
    text('system'),
    direction && `${direction} webhooks`,
    removedFile && `removed ${removedFile}`,
    fields.length > 0 && `changed ${fields.join(', ')}`,
    service && `from ${service}`,
  ].filter((fact): fact is string => typeof fact === 'string' && fact.length > 0)
}
