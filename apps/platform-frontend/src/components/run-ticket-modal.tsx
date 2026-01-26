'use client'

import { Button } from '@/components/button'
import { Dialog, DialogActions, DialogBody, DialogDescription, DialogTitle } from '@/components/dialog'
import { Listbox, ListboxLabel, ListboxOption } from '@/components/listbox'
import { runTicket } from '@/service/api/job-api'
import type { Clanker, Ticket } from '@viberglass/types'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

interface RunTicketModalProps {
  ticket: Ticket | null
  clankers: Clanker[]
  project: string
  open: boolean
  onClose: () => void
}

export function RunTicketModal({ ticket, clankers, project, open, onClose }: RunTicketModalProps) {
  const router = useRouter()
  const activeClankers = clankers.filter((c) => c.status === 'active' && c.deploymentStrategyId)
  const [selectedClankerId, setSelectedClankerId] = useState<string>(activeClankers[0]?.id ?? '')
  const [isRunning, setIsRunning] = useState(false)

  useEffect(() => {
    if (activeClankers.length === 0) {
      if (selectedClankerId) setSelectedClankerId('')
      return
    }

    if (!activeClankers.some((clanker) => clanker.id === selectedClankerId)) {
      setSelectedClankerId(activeClankers[0].id)
    }
  }, [activeClankers, selectedClankerId])

  const selectedClanker = activeClankers.find((clanker) => clanker.id === selectedClankerId) ?? null

  // Reset selection when modal opens with new ticket
  // (handled by parent re-mounting or passing key)

  async function handleRun() {
    if (!ticket || !selectedClanker) return

    setIsRunning(true)
    try {
      const response = await runTicket(ticket.id, selectedClanker.id)
      const jobId = response.data.jobId

      // Show toast with link
      toast.success('Job started', {
        description: `Running "${ticket.title}" with ${selectedClanker.name}`,
        action: {
          label: 'View Job',
          onClick: () => router.push(`/project/${project}/jobs/${jobId}`),
        },
      })

      // Navigate to job page
      router.push(`/project/${project}/jobs/${jobId}`)
      onClose()
    } catch (error) {
      console.error('Failed to run ticket:', error)
      toast.error('Failed to start job', {
        description: error instanceof Error ? error.message : 'Unknown error',
      })
      setIsRunning(false)
    }
  }

  if (!ticket) return null

  return (
    <Dialog open={open} onClose={onClose} size="lg">
      <DialogTitle>Run Ticket with Clanker</DialogTitle>
      <DialogDescription>Create a job to fix this ticket using an AI coding agent.</DialogDescription>
      <DialogBody>
        <div className="space-y-6">
          {/* Ticket Info (read-only display) */}
          <div>
            <h4 className="text-sm font-medium text-zinc-900 dark:text-white">Ticket</h4>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{ticket.title}</p>
            {ticket.description && (
              <p className="mt-2 line-clamp-3 text-sm text-zinc-500 dark:text-zinc-500">{ticket.description}</p>
            )}
          </div>

          {/* Clanker Selection */}
          <div>
            <h4 className="mb-2 text-sm font-medium text-zinc-900 dark:text-white">Select Clanker</h4>
            {activeClankers.length > 0 ? (
              <Listbox
                value={selectedClankerId}
                onChange={setSelectedClankerId}
                placeholder="Select a clanker..."
              >
                {activeClankers.map((clanker) => (
                  <ListboxOption key={clanker.id} value={clanker.id}>
                    <ListboxLabel>{clanker.name}</ListboxLabel>
                  </ListboxOption>
                ))}
              </Listbox>
            ) : (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-500/30 dark:bg-amber-500/10">
                <p className="text-sm text-amber-800 dark:text-amber-200">
                  No active clankers available. Please configure and start a clanker first.
                </p>
                <Button href="/clankers" className="mt-2" color="amber">
                  Configure Clankers
                </Button>
              </div>
            )}
          </div>
        </div>
      </DialogBody>
      <DialogActions>
        <Button plain onClick={onClose} disabled={isRunning}>
          Cancel
        </Button>
        <Button color="brand" disabled={isRunning || !selectedClanker} onClick={handleRun}>
          {isRunning ? 'Starting...' : `Run with ${selectedClanker?.name || 'Clanker'}`}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
