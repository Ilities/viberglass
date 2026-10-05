import { Dropdown, DropdownButton, DropdownDescription, DropdownItem, DropdownLabel, DropdownMenu } from '@/components/dropdown'
import { postTaskMessage } from '@/service/api/discussion-api'
import { ChevronDownIcon } from '@radix-ui/react-icons'
import { useState } from 'react'
import { toast } from 'sonner'

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
 */
export function BringInAgent({ taskId, agents, onAsked }: { taskId: string; agents: BringableAgent[]; onAsked: () => void }) {
  const [asking, setAsking] = useState(false)
  if (agents.length === 0) return null

  async function bringIn(agent: BringableAgent) {
    setAsking(true)
    try {
      await postTaskMessage(taskId, bringInMessage(agent.name), { agentId: agent.id })
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
