import type { AgentSession } from '@/service/api/session-api'
import type { Clanker } from '@viberglass/types'
import type { Mentionable } from './task-composer'

/** The agents a message on the task can ask: those that can run, the one already on the task first. */
export function taskAgents(clankers: Clanker[], sessions: Pick<AgentSession, 'clankerId' | 'updatedAt'>[]): Mentionable[] {
  const latest = [...sessions].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]?.clankerId
  return clankers
    .filter((clanker) => clanker.deploymentStrategyId)
    .sort((a, b) => Number(b.id === latest) - Number(a.id === latest))
    .map((clanker) => ({ kind: 'agent', id: clanker.id, name: clanker.name }))
}
