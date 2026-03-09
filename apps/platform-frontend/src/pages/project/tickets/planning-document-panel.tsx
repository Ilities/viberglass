import { Badge } from '@/components/badge'
import { Button } from '@/components/button'
import { Subheading } from '@/components/heading'
import { RunTicketModal } from '@/components/run-ticket-modal'
import {
  approvePlanning,
  getPhaseDocumentRevisions,
  getPlanningPhase,
  requestPlanningApproval,
  revokePlanningApproval,
  savePlanningDocument,
  type ApprovalState,
  type PhaseDocumentResponse,
  type PhaseDocumentRevisionResponse,
  type PlanningRunResponse,
} from '@/service/api/ticket-api'
import { CheckCircledIcon, CrossCircledIcon, Pencil1Icon, PlayIcon, ReaderIcon } from '@radix-ui/react-icons'
import type { Clanker, Ticket } from '@viberglass/types'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { PhaseDocumentRevisionHistory } from './phase-document-revision-history'
import { PhaseDocumentComments } from './phase-document-comments'
import { getApprovalStateBadgeColor, getApprovalStateLabel, getPhaseRunStatusBadgeColor } from './phase-document-ui'

interface PlanningDocumentPanelProps {
  ticket: Ticket
  clankers: Clanker[]
  project: string
  onWorkflowPhaseChange?: (phase: Ticket['workflowPhase']) => void
  onApprovalStateChange?: (state: ApprovalState) => void
}

export function PlanningDocumentPanel({
  ticket,
  clankers,
  project,
  onWorkflowPhaseChange,
  onApprovalStateChange,
}: PlanningDocumentPanelProps) {
  const navigate = useNavigate()
  const [document, setDocument] = useState<PhaseDocumentResponse | null>(null)
  const [revisions, setRevisions] = useState<PhaseDocumentRevisionResponse[]>([])
  const [latestRun, setLatestRun] = useState<PlanningRunResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [isRunModalOpen, setIsRunModalOpen] = useState(false)
  const [isApproving, setIsApproving] = useState(false)
  const [selectedRevisionId, setSelectedRevisionId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const load = useCallback(async () => {
    try {
      const [phase, history] = await Promise.all([
        getPlanningPhase(ticket.id),
        getPhaseDocumentRevisions(ticket.id, 'planning'),
      ])
      setDocument(phase.document)
      setLatestRun(phase.latestRun)
      setRevisions(history)
      setSelectedRevisionId(null)
      setDraft(phase.document.content)
      onApprovalStateChange?.(phase.document.approvalState)
    } finally {
      setIsLoading(false)
    }
  }, [ticket.id, onApprovalStateChange])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus()
    }
  }, [isEditing])

  const handleSave = useCallback(async () => {
    try {
      setIsSaving(true)
      const saved = await savePlanningDocument(ticket.id, draft)
      const history = await getPhaseDocumentRevisions(ticket.id, 'planning')
      setDocument(saved)
      setRevisions(history)
      setSelectedRevisionId(null)
      onApprovalStateChange?.(saved.approvalState)
      setIsEditing(false)
      toast.success('Planning document saved')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save')
    } finally {
      setIsSaving(false)
    }
  }, [ticket.id, draft, onApprovalStateChange])

  const handleCancel = useCallback(() => {
    setDraft(document?.content ?? '')
    setIsEditing(false)
  }, [document])

  const handleRequestApproval = useCallback(async () => {
    try {
      setIsApproving(true)
      const result = await requestPlanningApproval(ticket.id)
      setDocument(result.document)
      setLatestRun(result.latestRun)
      onApprovalStateChange?.(result.document.approvalState)
      toast.success('Planning approval requested')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to request planning approval')
    } finally {
      setIsApproving(false)
    }
  }, [ticket.id, onApprovalStateChange])

  const handleApprove = useCallback(async () => {
    try {
      setIsApproving(true)
      const result = await approvePlanning(ticket.id)
      setDocument(result.document)
      setLatestRun(result.latestRun)
      onApprovalStateChange?.(result.document.approvalState)
      onWorkflowPhaseChange?.('execution')
      toast.success('Planning approved - ticket advanced to execution')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to approve planning')
    } finally {
      setIsApproving(false)
    }
  }, [ticket.id, onApprovalStateChange, onWorkflowPhaseChange])

  const handleRevokeApproval = useCallback(async () => {
    try {
      setIsApproving(true)
      const result = await revokePlanningApproval(ticket.id)
      setDocument(result.document)
      setLatestRun(result.latestRun)
      onApprovalStateChange?.(result.document.approvalState)
      toast.success('Planning approval revoked')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to revoke planning approval')
    } finally {
      setIsApproving(false)
    }
  }, [ticket.id, onApprovalStateChange])

  const handleApplySuggestion = useCallback(async (lineNumber: number, suggestedText: string) => {
    const lines = (document?.content ?? '').split('\n')
    lines[lineNumber - 1] = suggestedText
    const newContent = lines.join('\n')
    try {
      setIsSaving(true)
      const saved = await savePlanningDocument(ticket.id, newContent)
      const history = await getPhaseDocumentRevisions(ticket.id, 'planning')
      setDocument(saved)
      setDraft(saved.content)
      setRevisions(history)
      onApprovalStateChange?.(saved.approvalState)
      toast.success(`Suggestion applied to line ${lineNumber}`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to apply suggestion')
      throw error
    } finally {
      setIsSaving(false)
    }
  }, [document, ticket.id, onApprovalStateChange])

  const isDirty = draft !== (document?.content ?? '')
  const hasContent = (document?.content ?? '').trim().length > 0
  const canEdit = ticket.workflowPhase === 'planning' || ticket.workflowPhase === 'execution'
  const canRunPlanning = ticket.workflowPhase === 'planning' || ticket.workflowPhase === 'execution'
  const canRequestApproval = hasContent && document?.approvalState === 'draft'
  const canApprove = document?.approvalState === 'approval_requested'
  const canRevoke = document?.approvalState === 'approved'
  const approvalIsPending = document?.approvalState === 'approval_requested'

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-sm text-[var(--gray-9)]">Loading planning document...</div>
      </div>
    )
  }

  return (
    <>
      <div className="space-y-5">
        <div className="space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1.5">
              <Subheading className="flex items-center gap-2">
                <ReaderIcon className="h-5 w-5 text-[var(--accent-9)]" />
                Planning Document
              </Subheading>
              {latestRun && (
                <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--gray-9)]">
                  <Badge color={getPhaseRunStatusBadgeColor(latestRun.status)}>
                    {latestRun.status === 'active' ? 'Planning Running' : `Planning ${latestRun.status}`}
                  </Badge>
                  <span>
                    Latest run with {latestRun.clankerName || 'Unknown clanker'} on{' '}
                    {new Date(latestRun.createdAt).toLocaleString()}
                  </span>
                  <Button plain onClick={() => navigate(`/project/${project}/jobs/${latestRun.jobId}`)}>
                    View Job
                  </Button>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              <Button
                color="brand"
                onClick={() => setIsRunModalOpen(true)}
                disabled={!canRunPlanning}
                title={
                  canRunPlanning
                    ? 'Generate planning with a clanker'
                    : 'Planning runs are only available during the planning phase'
                }
              >
                <PlayIcon className="h-3.5 w-3.5" />
                Run Plan
              </Button>
              {isEditing ? (
                <>
                  <Button plain onClick={handleCancel} disabled={isSaving}>
                    Cancel
                  </Button>
                  <Button color="brand" onClick={handleSave} disabled={isSaving || !isDirty}>
                    {isSaving ? 'Saving...' : 'Save'}
                  </Button>
                </>
              ) : (
                <Button
                  plain
                  onClick={() => setIsEditing(true)}
                  disabled={!canEdit}
                  title={canEdit ? 'Edit planning document' : 'Planning document is read-only in current phase'}
                >
                  <Pencil1Icon className="h-3.5 w-3.5" />
                  Edit
                </Button>
              )}
            </div>
          </div>

          {document && (
            <div className="flex flex-wrap items-center gap-2">
              <Badge color={getApprovalStateBadgeColor(document.approvalState)}>
                {getApprovalStateLabel(document.approvalState)}
              </Badge>
              {document.approvalState === 'approved' && document.approvedBy && (
                <span className="text-xs text-[var(--gray-9)]">
                  by {document.approvedBy} on {new Date(document.approvedAt!).toLocaleString()}
                </span>
              )}
              {canRequestApproval && (
                <Button
                  color="green"
                  onClick={handleRequestApproval}
                  disabled={isApproving || !hasContent}
                  title={hasContent ? 'Request approval for this planning document' : 'Add content before requesting approval'}
                >
                  <CheckCircledIcon className="h-3.5 w-3.5" />
                  Request Approval
                </Button>
              )}
              {canApprove && (
                <Button color="green" onClick={handleApprove} disabled={isApproving}>
                  <CheckCircledIcon className="h-3.5 w-3.5" />
                  {isApproving ? 'Approving...' : 'Approve'}
                </Button>
              )}
              {canRevoke && (
                <Button plain onClick={handleRevokeApproval} disabled={isApproving}>
                  <CrossCircledIcon className="h-3.5 w-3.5" />
                  {isApproving ? 'Revoking...' : 'Revoke Approval'}
                </Button>
              )}
              {approvalIsPending && (
                <span className="text-xs text-[var(--gray-9)]">Waiting for approval...</span>
              )}
            </div>
          )}
        </div>

        {document?.updatedAt && hasContent && (
          <div className="text-xs text-[var(--gray-9)]">
            Last updated {new Date(document.updatedAt).toLocaleString()}
          </div>
        )}

        {isEditing ? (
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="min-h-[400px] w-full resize-y rounded-lg border border-[var(--gray-6)] bg-[var(--gray-1)] p-4 font-mono text-sm text-[var(--gray-12)] placeholder:text-[var(--gray-8)] focus:border-[var(--accent-8)] focus:ring-1 focus:ring-[var(--accent-8)] focus:outline-none"
            placeholder="Write planning notes in markdown..."
          />
        ) : hasContent ? (
          <PhaseDocumentComments ticketId={ticket.id} phase="planning" content={document!.content} onApplySuggestion={handleApplySuggestion} />
        ) : (
          <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-[var(--gray-6)] bg-[var(--gray-2)] p-12 text-center">
            <ReaderIcon className="h-8 w-8 text-[var(--gray-8)]" />
            <div>
              <p className="text-sm font-medium text-[var(--gray-11)]">No planning document yet</p>
              <p className="mt-1 text-sm text-[var(--gray-9)]">
                Run planning or click Edit to start writing notes for this ticket.
              </p>
            </div>
          </div>
        )}

        <PhaseDocumentRevisionHistory
          revisions={revisions}
          selectedRevisionId={selectedRevisionId}
          onSelectRevision={setSelectedRevisionId}
        />
      </div>

      <RunTicketModal
        ticket={ticket}
        clankers={clankers}
        project={project}
        open={isRunModalOpen}
        onClose={() => {
          setIsRunModalOpen(false)
          void load()
        }}
        mode="planning"
      />
    </>
  )
}
