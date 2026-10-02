/** What the audit log covers, one area per kind of thing changed. */
export const AUDIT_TARGET_TYPES = ['run', 'approval', 'connection', 'secret', 'runner', 'member', 'space', 'invite'] as const

export type AuditTargetType = (typeof AUDIT_TARGET_TYPES)[number]

export function isAuditTargetType(value: unknown): value is AuditTargetType {
  return AUDIT_TARGET_TYPES.some((type) => type === value)
}

/** Each recorded action, as one plain sentence about its target. */
export const AUDIT_ACTION_TEXT = {
  'run.started': 'started a run',
  'run.cancelled': 'cancelled a run',
  // No longer recorded since approvals went; kept so older entries still read.
  'approval.granted': 'approved a step',
  'connection.created': 'added a connection',
  'connection.updated': 'changed a connection',
  'connection.deleted': 'removed a connection',
  'connection.credential_added': 'added a credential to a connection',
  'connection.credential_updated': 'changed a connection credential',
  'connection.credential_removed': 'removed a connection credential',
  'connection.webhook_changed': "changed a connection's webhooks",
  'connection.linked': 'linked a connection to a space',
  'connection.unlinked': 'unlinked a connection from a space',
  'connection.made_primary': "changed a space's primary connection",
  'secret.created': 'added a secret',
  'secret.updated': 'changed a secret',
  'secret.deleted': 'deleted a secret',
  'runner.created': 'added an agent',
  'runner.updated': 'changed an agent',
  'runner.deleted': 'deleted an agent',
  'runner.started': 'started an agent',
  'runner.stopped': 'stopped an agent',
  'member.created': 'created an account',
  'member.role_changed': "changed someone's workspace role",
  'member.deactivated': 'deactivated someone',
  'member.reactivated': 'reactivated someone',
  'member.reset_link_created': 'made a password reset link',
  'space.updated': "changed a space's settings",
  'space.member_set': "added someone to a space or changed their role",
  'space.member_removed': 'removed someone from a space',
  'space.deleted': 'deleted a space',
  'invite.created': 'invited someone',
  'invite.revoked': 'revoked an invite',
  'invite.accepted': 'accepted an invite',
} as const

export type AuditAction = keyof typeof AUDIT_ACTION_TEXT

export function isAuditAction(value: unknown): value is AuditAction {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(AUDIT_ACTION_TEXT, value)
}

/** An audit log entry as admins read it. */
export interface AuditEntry {
  id: string
  actor: { id: string; name: string } | null
  actorKind: 'human' | 'system'
  action: AuditAction
  targetType: AuditTargetType
  targetId: string | null
  /** Safe, listed facts only (a role, a step, which fields changed); never secret values. */
  details: Record<string, unknown>
  ip: string | null
  createdAt: string
}
