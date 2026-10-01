import type { AuditEntry } from '@viberglass/types'
import { auditDetails, auditSentence } from './audit-entry-text'

const entry = (overrides: Partial<AuditEntry>): AuditEntry => ({
  id: 'a-1',
  actor: { id: 'u-1', name: 'Maria' },
  actorKind: 'human',
  action: 'secret.updated',
  targetType: 'secret',
  targetId: 's-1',
  details: {},
  ip: null,
  createdAt: '2026-10-01T10:00:00.000Z',
  ...overrides,
})

describe('audit entry text', () => {
  it('says who did what, with the system standing in for nobody', () => {
    expect(auditSentence(entry({}))).toBe('Maria changed a secret')
    expect(auditSentence(entry({ actor: null, actorKind: 'system', action: 'run.started' }))).toBe('The system started a run')
    expect(auditSentence(entry({ actor: null, actorKind: 'system', action: 'run.started', details: { via: 'slack', slackUserId: 'U999' } }))).toBe(
      'Slack user U999 started a run'
    )
    expect(auditDetails(entry({ action: 'run.started', details: { step: 'research', via: 'slack', slackUserId: 'U1' } }), () => '')).toEqual([
      'the research',
      'from Slack',
    ])
  })

  it('puts the listed details in plain words', () => {
    expect(auditDetails(entry({ details: { fields: ['name', 'value'] } }), () => '')).toEqual(['changed name, value'])
    expect(auditDetails(entry({ action: 'approval.granted', details: { step: 'planning' } }), () => '')).toEqual(['the plan'])
    expect(auditDetails(entry({ action: 'space.member_set', details: { userId: 'u-2', role: 'maintainer' } }), () => 'Tomi')).toEqual([
      'Tomi',
      'as maintainer',
    ])
  })
})
