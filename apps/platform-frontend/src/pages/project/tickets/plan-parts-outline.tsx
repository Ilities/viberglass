import { Badge } from '@/components/badge'
import { Button } from '@/components/button'
import { askAgent } from '@/service/api/discussion-api'
import { nextBuild, planParts, type TaskPlanParts, type TaskPlanPartStatus } from '@viberglass/types'
import { ExternalLinkIcon } from '@radix-ui/react-icons'
import { useState } from 'react'
import { toast } from 'sonner'

const STATUS: Record<TaskPlanPartStatus, { label: string; color: 'zinc' | 'blue' | 'green' }> = {
  not_built: { label: 'Not built', color: 'zinc' },
  building: { label: 'Building', color: 'blue' },
  open: { label: 'PR open', color: 'blue' },
  merged: { label: 'Merged', color: 'green' },
}

/**
 * The parts a plan is built in, each one pull request, with where each stands
 * and a build for the next one; nothing for a plan that's one part.
 */
export function PlanPartsOutline({
  plan,
  state,
  ticketId,
  canBuild,
  onAsked,
}: {
  plan: string
  /** Where each part stands, from the task's pull requests; null while unknown. */
  state: TaskPlanParts | null
  ticketId: string
  canBuild: boolean
  onAsked: () => void
}) {
  const [asking, setAsking] = useState(false)
  const parts = planParts(plan)
  if (parts.length < 2) return null
  const statusOf = (number: number) => state?.parts.find((part) => part.number === number)
  const next = state && canBuild ? nextBuild(state) : null

  async function build() {
    if (!next?.parts) return
    setAsking(true)
    try {
      await askAgent(ticketId, { action: 'code', body: next.label, parts: next.parts })
      onAsked()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't ask the agent")
    } finally {
      setAsking(false)
    }
  }

  return (
    <nav aria-label="Parts" className="mb-4 rounded-lg border border-[var(--gray-5)] px-4 py-3">
      <p className="text-sm font-medium text-[var(--gray-12)]">Built in {parts.length} parts, one pull request each</p>
      <ol className="mt-2 space-y-2 text-sm text-[var(--gray-11)]">
        {parts.map((part) => {
          const status = statusOf(part.number)
          const shown = status ? STATUS[status.status] : null
          return (
            <li key={`${part.number}:${part.title ?? ''}`} className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span>
                <span className="text-[var(--gray-10)]">Part {part.number}</span>
                {part.title && <> · {part.title}</>}
              </span>
              {shown && <Badge color={shown.color}>{shown.label}</Badge>}
              {status?.pullRequestUrl && (
                <a
                  href={status.pullRequestUrl}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={`Part ${part.number}'s pull request`}
                  className="text-[var(--accent-11)]"
                >
                  <ExternalLinkIcon className="size-3.5" />
                </a>
              )}
              {next?.parts?.first === part.number && (
                <Button outline className="ml-auto" disabled={asking} onClick={() => void build()}>
                  {asking ? 'Asking…' : next.label}
                </Button>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
