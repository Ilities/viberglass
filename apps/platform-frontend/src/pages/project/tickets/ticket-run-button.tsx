

import { Button } from '@/components/button'
import { RunTicketModal } from '@/components/run-ticket-modal'
import { PlayIcon } from '@radix-ui/react-icons'
import type { Clanker, Ticket } from '@viberglass/types'
import { useState } from 'react'

interface TicketRunButtonProps {
  ticket: Ticket
  clankers: Clanker[]
  project: string
}

export function TicketRunButton({ ticket, clankers, project }: TicketRunButtonProps) {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const activeClankers = clankers.filter((c) => c.status === 'active' && c.deploymentStrategyId)
  const defaultClanker = activeClankers[0]

  return (
    <>
      <Button
        color="brand"
        onClick={() => setIsModalOpen(true)}
        title={activeClankers.length > 0 ? `Run with ${defaultClanker?.name}` : 'No active clankers'}
      >
        <PlayIcon className="h-5 w-5" />
        {activeClankers.length > 0 ? `Run with ${defaultClanker?.name}` : 'Run'}
      </Button>

      <RunTicketModal
        ticket={ticket}
        clankers={clankers}
        project={project}
        open={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      />
    </>
  )
}
