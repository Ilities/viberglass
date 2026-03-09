import { Badge } from '@/components/badge'
import { Button } from '@/components/button'
import { RunTicketModal } from '@/components/run-ticket-modal'
import { Subheading } from '@/components/heading'
import {
  type PhaseDocumentResponse,
  type PhaseDocumentRevisionResponse,
  type ResearchRunResponse,
  approveResearch,
  getPhaseDocumentRevisions,
  getResearchDocument,
  requestResearchApproval,
  revokeResearchApproval,
  saveResearchDocument,
} from '@/service/api/ticket-api'
import { CheckCircledIcon, CrossCircledIcon, Pencil1Icon, PlayIcon, ReaderIcon } from '@radix-ui/react-icons'
import type { Clanker, Ticket } from '@viberglass/types'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { PhaseDocumentRevisionHistory } from './phase-document-revision-history'
import { PhaseDocumentComments } from './phase-document-comments'
import { getApprovalStateBadgeColor, getApprovalStateLabel, getPhaseRunStatusBadgeColor } from './phase-document-ui'

interface ResearchDocumentPanelProps {
  ticket: Ticket
  clankers: Clanker[]
  project: string
  onWorkflowPhaseChange?: (phase: Ticket['workflowPhase']) => void
}

export function ResearchDocumentPanel({
  ticket,
  clankers,
  project,
  onWorkflowPhaseChange,
}: ResearchDocumentPanelProps) {
  const navigate = useNavigate()
  const [document, setDocument] = useState<PhaseDocumentResponse | null>(null)
  const [revisions, setRevisions] = useState<PhaseDocumentRevisionResponse[]>([])
  const [latestRun, setLatestRun] = useState<ResearchRunResponse | null>(null)
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
        getResearchDocument(ticket.id),
        getPhaseDocumentRevisions(ticket.id, 'research'),
      ])
      setDocument(phase.document)
      setLatestRun(phase.latestRun)
      setRevisions(history)
      setSelectedRevisionId(null)
      setDraft(phase.document.content)
    } finally {
      setIsLoading(false)
    }
  }, [ticket.id])

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
      const saved = await saveResearchDocument(ticket.id, draft)
      const history = await getPhaseDocumentRevisions(ticket.id, 'research')
      setDocument(saved)
      setRevisions(history)
      setSelectedRevisionId(null)
      setIsEditing(false)
      toast.success('Research document saved')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save')
    } finally {
      setIsSaving(false)
    }
  }, [ticket.id, draft])

  const handleCancel = useCallback(() => {
    setDraft(document?.content ?? '')
    setIsEditing(false)
  }, [document])

  const handleRequestApproval = useCallback(async () => {
    try {
      setIsApproving(true)
      const result = await requestResearchApproval(ticket.id)
      setDocument(result.document)
      setLatestRun(result.latestRun)
      toast.success('Approval requested')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to request approval')
    } finally {
      setIsApproving(false)
    }
  }, [ticket.id])

  const handleApprove = useCallback(async () => {
    try {
      setIsApproving(true)
      const result = await approveResearch(ticket.id)
      setDocument(result.document)
      setLatestRun(result.latestRun)
      onWorkflowPhaseChange?.('planning')
      toast.success('Research approved - ticket advanced to planning')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to approve research')
    } finally {
      setIsApproving(false)
    }
  }, [ticket.id, onWorkflowPhaseChange])

  const handleRevokeApproval = useCallback(async () => {
    try {
      setIsApproving(true)
      const result = await revokeResearchApproval(ticket.id)
      setDocument(result.document)
      setLatestRun(result.latestRun)
      toast.success('Approval revoked')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to revoke approval')
    } finally {
      setIsApproving(false)
    }
  }, [ticket.id])

  const handleApplySuggestion = useCallback(async (lineNumber: number, suggestedText: string) => {
    const lines = (document?.content ?? '').split('\n')
    lines[lineNumber - 1] = suggestedText
    const newContent = lines.join('\n')
    try {
      setIsSaving(true)
      const saved = await saveResearchDocument(ticket.id, newContent)
      const history = await getPhaseDocumentRevisions(ticket.id, 'research')
      setDocument(saved)
      setDraft(saved.content)
      setRevisions(history)
      toast.success(`Suggestion applied to line ${lineNumber}`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to apply suggestion')
      throw error
    } finally {
      setIsSaving(false)
    }
  }, [document, ticket.id])

  const isDirty = draft !== (document?.content ?? '')
  const hasContent = (document?.content ?? '').trim().length > 0
  const canRequestApproval = hasContent && document?.approvalState === 'draft'
  const canApprove = document?.approvalState === 'approval_requested'
  const canRevoke = document?.approvalState === 'approved'
  const approvalIsPending = document?.approvalState === 'approval_requested'

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-sm text-[var(--gray-9)]">Loading research document...</div>
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
                Research Document
              </Subheading>
              {latestRun && (
                <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--gray-9)]">
                  <Badge color={getPhaseRunStatusBadgeColor(latestRun.status)}>
                    {latestRun.status === 'active' ? 'Research Running' : `Research ${latestRun.status}`}
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
                disabled={ticket.workflowPhase !== 'research'}
                title={
                  ticket.workflowPhase === 'research'
                    ? 'Generate research with a clanker'
                    : 'Research runs are only available during the research phase'
                }
              >
                <PlayIcon className="h-3.5 w-3.5" />
                Run Research
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
                <Button plain onClick={() => setIsEditing(true)}>
                  <Pencil1Icon className="h-3.5 w-3.5" />
                  Edit
                </Button>
              )}
            </div>
          </div>

          {/* Approval state badges and actions */}
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
                  title={hasContent ? 'Request approval for this research document' : 'Add content before requesting approval'}
                >
                  <CheckCircledIcon className="h-3.5 w-3.5" />
                  Request Approval
                </Button>
              )}
              {canApprove && (
                <Button
                  color="green"
                  onClick={handleApprove}
                  disabled={isApproving}
                >
                  <CheckCircledIcon className="h-3.5 w-3.5" />
                  {isApproving ? 'Approving...' : 'Approve'}
                </Button>
              )}
              {canRevoke && (
                <Button
                  plain
                  onClick={handleRevokeApproval}
                  disabled={isApproving}
                >
                  <CrossCircledIcon className="h-3.5 w-3.5" />
                  {isApproving ? 'Revoking...' : 'Revoke Approval'}
                </Button>
              )}
              {approvalIsPending && (
                <span className="text-xs text-[var(--gray-9)]">
                  Waiting for approval...
                </span>
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
            className="w-full min-h-[400px] resize-y rounded-lg border border-[var(--gray-6)] bg-[var(--gray-1)] p-4 font-mono text-sm text-[var(--gray-12)] placeholder:text-[var(--gray-8)] focus:border-[var(--accent-8)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-8)]"
            placeholder="Write research notes in markdown..."
          />
        ) : hasContent ? (
          <PhaseDocumentComments ticketId={ticket.id} phase="research" content={document!.content} onApplySuggestion={handleApplySuggestion} />
        ) : (
          <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-[var(--gray-6)] bg-[var(--gray-2)] p-12 text-center">
            <ReaderIcon className="h-8 w-8 text-[var(--gray-8)]" />
            <div>
              <p className="text-sm font-medium text-[var(--gray-11)]">No research document yet</p>
              <p className="mt-1 text-sm text-[var(--gray-9)]">
                Run research or click Edit to start writing notes for this ticket.
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
        mode="research"
      />
    </>
  )
}
