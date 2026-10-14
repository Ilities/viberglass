import { Dropdown, DropdownButton, DropdownDescription, DropdownItem, DropdownLabel, DropdownMenu } from '@/components/dropdown'
import { postTaskMessage } from '@/service/api/discussion-api'
import { ChevronDownIcon } from '@radix-ui/react-icons'
import { useState } from 'react'
import { toast } from 'sonner'
import type { ComposerDraft } from './composer-draft'

export interface BringableAgent {
  id: string
  name: string
}

/** The message that brings an agent in, which the thread shows under the person's name. */
export function bringInMessage(name: string): string {
  return `Bring in ${name}: it starts fresh and reads the summary and the task`
}

/**
 * Brings another agent onto the task. It has no session or prompt cache of its
 * own yet, so it starts cold, from the summary and the current artifacts.
 * What's written in the composer goes with it, in place of the usual words.
 */
export function BringInAgent({
  taskId,
  agents,
  onAsked,
  draft,
}: {
  taskId: string
  agents: BringableAgent[]
  onAsked: () => void
  draft?: ComposerDraft
}) {
  const [asking, setAsking] = useState(false)
  if (agents.length === 0) return null

  async function bringIn(agent: BringableAgent) {
    setAsking(true)
    const written = draft && !draft.isEmpty ? draft : null
    try {
      await postTaskMessage(taskId, written ? written.body() : bringInMessage(agent.name), { agentId: agent.id })
      written?.clear()
      onAsked()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't bring the agent in")
    } finally {
      setAsking(false)
    }
  }

  return (
    <Dropdown>
      <DropdownButton outline disabled={asking}>
        Bring in another agent
        <ChevronDownIcon data-slot="icon" />
      </DropdownButton>
      <DropdownMenu>
        {agents.map((agent) => (
          <DropdownItem key={agent.id} aria-label={agent.name} onClick={() => void bringIn(agent)}>
            <DropdownLabel>{agent.name}</DropdownLabel>
            <DropdownDescription>Starts fresh: reads the summary and the task</DropdownDescription>
          </DropdownItem>
        ))}
      </DropdownMenu>
    </Dropdown>
  )
}
