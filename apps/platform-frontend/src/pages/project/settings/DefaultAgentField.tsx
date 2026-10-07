import { Label } from '@/components/fieldset'
import { Select } from '@/components/select'
import { getClankers } from '@/service/api/clanker-api'
import type { Clanker } from '@viberglass/types'
import { useEffect, useState } from 'react'

/** Stands for "no agent of its own": the space uses the workspace's default agent. */
export const WORKSPACE_DEFAULT_AGENT = '__workspace_default__'

/** The slug setup gives the workspace's default agent; the API falls back to it when a space names none. */
const WORKSPACE_DEFAULT_AGENT_SLUG = 'default-agent'

function agentLabel(agent: Clanker): string {
  return agent.readiness && agent.readiness.state !== 'ready' ? `${agent.name} (can't run yet)` : agent.name
}

/** Which agent the space's tasks go to when nobody names one. */
export function DefaultAgentField({
  value,
  onChange,
  disabled,
}: {
  value: string
  onChange: (agentId: string) => void
  disabled?: boolean
}) {
  const [agents, setAgents] = useState<Clanker[] | null>(null)

  useEffect(() => {
    getClankers(100)
      .then(setAgents)
      .catch(() => setAgents([]))
  }, [])

  const workspaceDefault = agents?.find((agent) => agent.slug === WORKSPACE_DEFAULT_AGENT_SLUG)

  return (
    <div className="max-w-sm">
      <Label>Default agent</Label>
      <Select
        name="default_agent"
        aria-label="Default agent"
        value={value}
        onChange={(next) => {
          if (next !== '' && next !== value) onChange(next)
        }}
        disabled={disabled || agents === null}
      >
        <option value={WORKSPACE_DEFAULT_AGENT}>
          {workspaceDefault ? `Workspace default (${workspaceDefault.name})` : 'Workspace default'}
        </option>
        {(agents ?? []).map((agent) => (
          <option key={agent.id} value={agent.id}>
            {agentLabel(agent)}
          </option>
        ))}
      </Select>
    </div>
  )
}
