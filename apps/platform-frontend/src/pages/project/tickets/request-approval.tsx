import { Button } from '@/components/button'
import { Select } from '@/components/select'
import { requestStepApproval } from '@/service/api/approval-api'
import { getPeopleDirectory, type Person } from '@/service/api/user-api'
import type { ApprovalStep, StepApproval } from '@viberglass/types'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

/** "Waiting on Tomi's approval", for the banner's text; null when nobody on the task is named. */
export function waitingOnText(approval: StepApproval | null): string | null {
  const names = approval?.approvers.map((person) => person.name) ?? []
  if (names.length === 0) return null
  return `Waiting on ${names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} or ${names[names.length - 1]}`} to approve.`
}

/**
 * For someone who may not approve the step (J7): ask a person to review it.
 * They become a reviewer, get a review request, and can then approve.
 */
export function RequestApproval({ taskId, step, onRequested }: { taskId: string; step: ApprovalStep; onRequested: () => void }) {
  const [people, setPeople] = useState<Person[]>([])
  const [chosen, setChosen] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    getPeopleDirectory()
      .then(setPeople)
      .catch(() => setPeople([]))
  }, [])

  async function ask() {
    setBusy(true)
    try {
      await requestStepApproval(taskId, step, [chosen])
      toast.success(`Asked ${people.find((person) => person.id === chosen)?.name ?? 'them'} to review`)
      setChosen('')
      onRequested()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to ask for a review')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Select aria-label="Request approval from" value={chosen} placeholder="Request approval from…" onChange={setChosen}>
        {people.map((person) => (
          <option key={person.id} value={person.id}>
            {person.name}
          </option>
        ))}
      </Select>
      <Button color="brand" disabled={!chosen || busy} onClick={() => void ask()}>
        {busy ? 'Asking…' : 'Ask to approve'}
      </Button>
    </>
  )
}
