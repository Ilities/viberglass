'use client'

import { Button } from '@/components/button'
import { Input } from '@/components/input'
import { Listbox, ListboxLabel, ListboxOption } from '@/components/listbox'
import { Select } from '@/components/select'
import { Textarea } from '@/components/textarea'
import { runTicket, type JobOverrides } from '@/service/api/job-api'
import { MagicWandIcon, PlayIcon } from '@radix-ui/react-icons'
import type { Clanker, Ticket } from '@viberglass/types'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

interface EnhanceFormProps {
  ticket: Ticket
  clankers: Clanker[]
  project: string
}

export function EnhanceForm({ ticket, clankers, project }: EnhanceFormProps) {
  const router = useRouter()
  const activeClankers = clankers.filter((c) => c.status === 'active' && c.deploymentStrategyId)
  const [selectedClankerId, setSelectedClankerId] = useState<string>(activeClankers[0]?.id ?? '')
  const [isRunning, setIsRunning] = useState(false)

  // Form state for overrides
  const [additionalContext, setAdditionalContext] = useState('')
  const [reproductionSteps, setReproductionSteps] = useState('')
  const [expectedBehavior, setExpectedBehavior] = useState('')
  const [priorityOverride, setPriorityOverride] = useState<string>('default')

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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedClanker) return

    setIsRunning(true)

    // Build overrides from form
    const overrides: JobOverrides = {}
    if (additionalContext.trim()) {
      overrides.additionalContext = additionalContext.trim()
    }
    if (reproductionSteps.trim()) {
      overrides.reproductionSteps = reproductionSteps.trim()
    }
    if (expectedBehavior.trim()) {
      overrides.expectedBehavior = expectedBehavior.trim()
    }
    if (priorityOverride !== 'default') {
      overrides.priorityOverride = priorityOverride as JobOverrides['priorityOverride']
    }

    try {
      const response = await runTicket(
        ticket.id,
        selectedClanker.id,
        Object.keys(overrides).length > 0 ? overrides : undefined,
      )
      const jobId = response.data.jobId

      toast.success('Job started', {
        description: `Running "${ticket.title}" with enhanced context`,
        action: {
          label: 'View Job',
          onClick: () => router.push(`/project/${project}/jobs/${jobId}`),
        },
      })

      router.push(`/project/${project}/jobs/${jobId}`)
    } catch (error) {
      console.error('Failed to run ticket:', error)
      toast.error('Failed to start job', {
        description: error instanceof Error ? error.message : 'Unknown error',
      })
      setIsRunning(false)
    }
  }

  async function handleQuickRun() {
    if (!selectedClanker) return

    setIsRunning(true)
    try {
      const response = await runTicket(ticket.id, selectedClanker.id)
      const jobId = response.data.jobId

      toast.success('Job started', {
        description: `Running "${ticket.title}" with ${selectedClanker.name}`,
        action: {
          label: 'View Job',
          onClick: () => router.push(`/project/${project}/jobs/${jobId}`),
        },
      })

      router.push(`/project/${project}/jobs/${jobId}`)
    } catch (error) {
      console.error('Failed to run ticket:', error)
      toast.error('Failed to start job', {
        description: error instanceof Error ? error.message : 'Unknown error',
      })
      setIsRunning(false)
    }
  }

  return (
    <form className="space-y-6" onSubmit={handleSubmit}>
      {/* Clanker Selection */}
      <div>
        <label className="mb-2 block text-sm font-medium text-zinc-900 dark:text-white">Select Clanker</label>
        {activeClankers.length > 0 ? (
          <Listbox value={selectedClankerId} onChange={setSelectedClankerId} placeholder="Select a clanker...">
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

      <div>
        <label className="block text-sm font-medium text-zinc-900 dark:text-white">Additional Context</label>
        <Textarea
          rows={4}
          placeholder="Add any additional context, steps to reproduce, or observations..."
          className="mt-2"
          name="additionalContext"
          value={additionalContext}
          onChange={(e) => setAdditionalContext(e.target.value)}
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-zinc-900 dark:text-white">Reproduction Steps</label>
        <Textarea
          rows={3}
          placeholder="Describe the steps to reproduce this issue..."
          className="mt-2"
          name="reproductionSteps"
          value={reproductionSteps}
          onChange={(e) => setReproductionSteps(e.target.value)}
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-zinc-900 dark:text-white">Expected Behavior</label>
        <Input
          type="text"
          placeholder="What should happen instead?"
          className="mt-2"
          name="expectedBehavior"
          value={expectedBehavior}
          onChange={(e) => setExpectedBehavior(e.target.value)}
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-zinc-900 dark:text-white">Priority Override</label>
        <Select
          name="priorityOverride"
          className="mt-2"
          value={priorityOverride}
          onChange={(e) => setPriorityOverride(e.target.value)}
        >
          <option value="default">Use original priority</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </Select>
      </div>

      <div className="flex gap-4">
        <Button type="submit" color="brand" className="flex-1" disabled={isRunning || !selectedClanker}>
          <MagicWandIcon className="mr-2 h-5 w-5" />
          {isRunning ? 'Starting...' : 'Enhance & Send to AI'}
        </Button>
        <Button
          type="button"
          color="lime"
          className="flex-1"
          disabled={isRunning || !selectedClanker}
          onClick={handleQuickRun}
        >
          <PlayIcon className="mr-2 h-5 w-5" />
          {isRunning ? 'Starting...' : 'Quick Run (No Overrides)'}
        </Button>
      </div>
    </form>
  )
}
