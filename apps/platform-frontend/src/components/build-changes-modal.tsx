import { Button } from '@/components/button'
import { Checkbox, CheckboxField } from '@/components/checkbox'
import { Dialog, DialogActions, DialogBody, DialogDescription, DialogTitle } from '@/components/dialog'
import { Label } from '@/components/fieldset'
import { Listbox, ListboxLabel, ListboxOption } from '@/components/listbox'
import { getBuildPullRequest, type BuildPullRequest } from '@/service/api/build-api'
import { runTicket } from '@/service/api/job-api'
import type { Clanker, Ticket } from '@viberglass/types'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { ReviewCommentList } from './review-comment-list'

interface BuildChangesModalProps {
  ticket: Ticket
  clankers: Clanker[]
  project: string
  /** The agent the last build used, picked first. */
  defaultClankerId: string | null
  onClose: () => void
}

/**
 * Asks the agent to change an earlier build: the next build continues the
 * task's branch, so its commits land on the same pull request. Mount it to
 * open it; each opening starts from a clean form.
 */
export function BuildChangesModal({ ticket, clankers, project, defaultClankerId, onClose }: BuildChangesModalProps) {
  const navigate = useNavigate()
  const activeClankers = clankers.filter((clanker) => clanker.status === 'active' && clanker.deploymentStrategyId)
  const [clankerId, setClankerId] = useState(
    () => activeClankers.find((clanker) => clanker.id === defaultClankerId)?.id ?? activeClankers[0]?.id ?? '',
  )
  const [message, setMessage] = useState('')
  const [pullRequest, setPullRequest] = useState<BuildPullRequest | null>(null)
  const [includeComments, setIncludeComments] = useState(true)
  const [isRunning, setIsRunning] = useState(false)

  useEffect(() => {
    getBuildPullRequest(ticket.id)
      .then(setPullRequest)
      .catch((error: unknown) =>
        setPullRequest({ pullRequestUrl: null, details: null, comments: [], unavailableReason: error instanceof Error ? error.message : 'Failed to read the pull request' }),
      )
  }, [ticket.id])

  const comments = pullRequest?.comments ?? []
  const sendsComments = includeComments && comments.length > 0
  const canRun = Boolean(clankerId) && (message.trim().length > 0 || sendsComments) && !isRunning

  async function handleRun() {
    setIsRunning(true)
    try {
      const response = await runTicket(ticket.id, clankerId, undefined, undefined, {
        message: message.trim() || undefined,
        includePullRequestComments: sendsComments,
      })
      toast.success('The agent is making the changes', { description: 'Its commits go on the same pull request.' })
      onClose()
      navigate(`/spaces/${project}/tasks/${ticket.id}?run=${response.data.jobId}`)
    } catch (error) {
      toast.error('Failed to start the build', { description: error instanceof Error ? error.message : 'Unknown error' })
      setIsRunning(false)
    }
  }

  return (
    <Dialog open onClose={onClose} size="lg">
      <DialogTitle>Ask for changes to the build</DialogTitle>
      <DialogDescription>
        The agent picks up the pull request&apos;s branch where the last build left it and adds commits, so the same
        pull request updates.
      </DialogDescription>
      <DialogBody>
        <div className="space-y-6">
          <div>
            <h4 className="mb-2 text-sm font-medium text-[var(--gray-12)]">What should change?</h4>
            <textarea
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              rows={4}
              className="w-full rounded-lg border border-[var(--gray-6)] bg-[var(--gray-1)] px-3 py-2 text-sm text-[var(--gray-12)] focus:border-[var(--accent-8)] focus:ring-1 focus:ring-[var(--accent-8)] focus:outline-none"
              placeholder="E.g. 'Keep the old prices file as a fallback, and add a test for a provider that returns no models.'"
            />
          </div>

          <div>
            <h4 className="mb-2 text-sm font-medium text-[var(--gray-12)]">Review comments on the pull request</h4>
            {pullRequest === null ? (
              <p className="text-sm text-[var(--gray-9)]">Reading the pull request…</p>
            ) : pullRequest.unavailableReason ? (
              <p className="text-sm text-[var(--gray-10)]">{pullRequest.unavailableReason}. Only your note goes to the agent.</p>
            ) : comments.length === 0 ? (
              <p className="text-sm text-[var(--gray-10)]">No open review comments. Only your note goes to the agent.</p>
            ) : (
              <div className="space-y-3">
                <CheckboxField>
                  <Checkbox
                    checked={includeComments}
                    onChange={(checked) => {
                      if (typeof checked === 'boolean') setIncludeComments(checked)
                    }}
                  />
                  <Label>
                    Send the {comments.length} open comment{comments.length === 1 ? '' : 's'} to the agent too
                  </Label>
                </CheckboxField>
                <ReviewCommentList comments={comments} className="max-h-64 overflow-y-auto" />
              </div>
            )}
          </div>

          <div>
            <h4 className="mb-2 text-sm font-medium text-[var(--gray-12)]">Agent runner</h4>
            {activeClankers.length > 0 ? (
              <Listbox value={clankerId} onChange={setClankerId} placeholder="Select an agent runner...">
                {activeClankers.map((clanker) => (
                  <ListboxOption key={clanker.id} value={clanker.id}>
                    <ListboxLabel>{clanker.name}</ListboxLabel>
                  </ListboxOption>
                ))}
              </Listbox>
            ) : (
              <p className="text-sm text-[var(--gray-10)]">No agent runner is started. Start one in Settings, then come back.</p>
            )}
          </div>
        </div>
      </DialogBody>
      <DialogActions>
        <Button plain onClick={onClose} disabled={isRunning}>
          Cancel
        </Button>
        <Button color="brand" disabled={!canRun} onClick={() => void handleRun()}>
          {isRunning ? 'Starting…' : 'Make the changes'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
