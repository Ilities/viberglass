import { Button } from '@/components/button'
import { AGENT_LABELS, type AgentType } from '@viberglass/types'
import { useState } from 'react'
import { AgentSelectionCards } from '../config/selectionCards'

interface AgentSectionProps {
  value: AgentType | ''
  onChange: (agent: AgentType) => void
  /** An existing runner starts collapsed: changing its agent is rare and resets its model settings. */
  collapsed: boolean
}

export function AgentSection({ value, onChange, collapsed }: AgentSectionProps) {
  const [expanded, setExpanded] = useState(!collapsed)

  if (!expanded && value) {
    return (
      <div className="flex items-center justify-between rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
        <span className="text-sm font-semibold text-zinc-950 dark:text-white">{AGENT_LABELS[value]}</span>
        <Button type="button" outline onClick={() => setExpanded(true)}>
          Change agent
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {collapsed && (
        <p className="text-sm text-amber-700 dark:text-amber-400">
          A different agent may need a different key and model; check the Model section after switching.
        </p>
      )}
      <AgentSelectionCards value={value} onChange={onChange} />
    </div>
  )
}
