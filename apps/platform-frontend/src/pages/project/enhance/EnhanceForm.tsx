import { Button } from '@/components/button'
import { Field, FieldGroup, Fieldset, Label } from '@/components/fieldset'
import { Select } from '@/components/select'
import { Textarea } from '@/components/textarea'
import { runTicket } from '@/service/api/job-api'
import type { Clanker, Ticket } from '@viberglass/types'
import { useNavigate } from 'react-router-dom'
import { useState } from 'react'
import { toast } from 'sonner'

interface EnhanceFormProps {
  ticket: Ticket
  clankers: Clanker[]
  project: string
}

export function EnhanceForm({ ticket, clankers, project }: EnhanceFormProps) {
  const navigate = useNavigate()
  const [selectedClankerId, setSelectedClankerId] = useState('')
  const [prompt, setPrompt] = useState('')
  const [isRunning, setIsRunning] = useState(false)

  const activeClankers = clankers.filter((c) => c.status === 'active' && c.deploymentStrategyId)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()

    if (!selectedClankerId) {
      toast.error('Please select a clanker')
      return
    }

    setIsRunning(true)
    try {
      const job = await runTicket(ticket.id, selectedClankerId, prompt || undefined)
      toast.success('Enhancement started successfully')
      navigate(`/project/${project}/jobs/${job.id}`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to start enhancement')
      setIsRunning(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-lg border border-zinc-200 bg-white p-6 dark:border-white/10 dark:bg-zinc-900">
      <Fieldset>
        <FieldGroup>
          <Field>
            <Label>Clanker</Label>
            <Select value={selectedClankerId} onChange={(value) => setSelectedClankerId(value)} required>
              <option value="">Select a clanker...</option>
              {activeClankers.map((clanker) => (
                <option key={clanker.id} value={clanker.id}>
                  {clanker.name} {clanker.description && `(${clanker.description})`}
                </option>
              ))}
            </Select>
          </Field>

          <Field>
            <Label>Additional Instructions (Optional)</Label>
            <Textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Provide any additional context or instructions for the AI agent..."
              rows={3}
            />
          </Field>

          <Button type="submit" color="brand" disabled={isRunning || activeClankers.length === 0}>
            {isRunning ? 'Starting...' : 'Start Enhancement'}
          </Button>

          {activeClankers.length === 0 && (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              No active clankers available. Please start a clanker first.
            </p>
          )}
        </FieldGroup>
      </Fieldset>
    </form>
  )
}
