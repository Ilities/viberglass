import { Badge } from '@/components/badge'
import { Button } from '@/components/button'
import { Dropdown, DropdownButton, DropdownDivider, DropdownItem, DropdownMenu } from '@/components/dropdown'
import { discardBuild, markPlanPart, unmarkPlanPart } from '@/service/api/build-api'
import { askAgent } from '@/service/api/discussion-api'
import {
  addPartMessage,
  nextBuild,
  partRangeName,
  planParts,
  type TaskPlanPart,
  type TaskPlanParts,
  type TaskPlanPartStatus,
} from '@viberglass/types'
import { DotsHorizontalIcon, ExternalLinkIcon } from '@radix-ui/react-icons'
import { useState } from 'react'
import { toast } from 'sonner'

const STATUS: Record<TaskPlanPartStatus, { label: string; color: 'zinc' | 'blue' | 'green' }> = {
  not_built: { label: 'Not built', color: 'zinc' },
  building: { label: 'Building', color: 'blue' },
  open: { label: 'PR open', color: 'blue' },
  merged: { label: 'Merged', color: 'green' },
  done: { label: 'Done', color: 'green' },
  skipped: { label: 'Skipped', color: 'zinc' },
}

/**
 * The parts a plan is built in, each one pull request, with where each stands
 * and a build for the next one; nothing for a plan that's one part. Past the
 * usual order, a part can be added to the open pull request, marked done or
 * skipped, and a build that never opened its pull request discarded.
 */
export function PlanPartsOutline({
  plan,
  state,
  ticketId,
  canBuild,
  canChange,
  onChanged,
}: {
  plan: string
  /** Where each part stands, from the task's pull requests; null while unknown. */
  state: TaskPlanParts | null
  ticketId: string
  /** May ask for a build now: may ask for code, and the agent isn't working. */
  canBuild: boolean
  /** May mark parts and discard a build: whoever may ask for code. */
  canChange: boolean
  /** Someone asked for a build or changed where a part stands. */
  onChanged: () => void
}) {
  const [busy, setBusy] = useState(false)
  const parts = planParts(plan)
  if (parts.length < 2) return null
  const statusOf = (number: number) => state?.parts.find((part) => part.number === number)
  const next = state && canBuild ? nextBuild(state) : null
  const addable = state && canBuild && state.open ? state.addable : null

  async function run(action: () => Promise<unknown>, failure: string) {
    setBusy(true)
    try {
      await action()
      onChanged()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : failure)
    } finally {
      setBusy(false)
    }
  }

  const build = () =>
    next?.parts && run(() => askAgent(ticketId, { action: 'code', body: next.label, parts: next.parts }), "Couldn't ask the agent")
  const add = (part: number) =>
    run(() => askAgent(ticketId, { action: 'code', body: addPartMessage(part), parts: { first: part, last: part }, add: true }), "Couldn't ask the agent")

  return (
    <nav aria-label="Parts" className="mb-4 rounded-lg border border-[var(--gray-5)] px-4 py-3">
      <p className="text-sm font-medium text-[var(--gray-12)]">Built in {parts.length} parts, one pull request each</p>
      <ol className="mt-2 space-y-2 text-sm text-[var(--gray-11)]">
        {parts.map((part) => {
          const status = statusOf(part.number)
          const shown = status ? STATUS[status.status] : null
          const open = state?.open ?? null
          // Discarded from the first part of the build that never opened its pull request.
          const discardable = canBuild && open && open.first === part.number && status?.status === 'building'
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
              <span className="ml-auto flex items-center gap-1">
                {next?.parts?.first === part.number && (
                  <Button outline disabled={busy} onClick={() => void build()}>
                    {busy ? 'Asking…' : next.label}
                  </Button>
                )}
                {addable === part.number && open && (
                  <Button outline disabled={busy} onClick={() => void add(part.number)}>
                    Add to {partRangeName({ first: open.first, last: part.number - 1 })}&rsquo;s pull request
                  </Button>
                )}
                {canChange && status && (
                  <PartMenu
                    part={status}
                    busy={busy}
                    onMark={(mark) => void run(() => markPlanPart(ticketId, part.number, mark), "Couldn't mark the part")}
                    onUnmark={() => void run(() => unmarkPlanPart(ticketId, part.number), "Couldn't take the mark back")}
                    onDiscard={discardable ? () => void run(() => discardBuild(ticketId), "Couldn't discard the build") : undefined}
                  />
                )}
              </span>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

function PartMenu({
  part,
  busy,
  onMark,
  onUnmark,
  onDiscard,
}: {
  part: TaskPlanPart
  busy: boolean
  onMark: (mark: 'done' | 'skipped') => void
  onUnmark: () => void
  onDiscard?: () => void
}) {
  const marked = part.status === 'done' || part.status === 'skipped'
  if (part.status === 'merged') return null
  return (
    <Dropdown>
      <DropdownButton plain aria-label={`Part ${part.number}'s options`} disabled={busy}>
        <DotsHorizontalIcon data-slot="icon" />
      </DropdownButton>
      <DropdownMenu>
        {marked ? (
          <DropdownItem onClick={onUnmark}>{part.status === 'done' ? 'Not done after all' : 'Not skipped after all'}</DropdownItem>
        ) : (
          <>
            <DropdownItem onClick={() => onMark('done')}>Mark done</DropdownItem>
            <DropdownItem onClick={() => onMark('skipped')}>Skip this part</DropdownItem>
          </>
        )}
        {onDiscard && (
          <>
            <DropdownDivider />
            <DropdownItem onClick={onDiscard}>Discard this build</DropdownItem>
          </>
        )}
      </DropdownMenu>
    </Dropdown>
  )
}
