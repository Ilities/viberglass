import { Badge } from '@/components/badge'
import { Button } from '@/components/button'
import { RunTicketModal } from '@/components/run-ticket-modal'
import { Subheading } from '@/components/heading'
import {
  approvePlanning,
  getPlanningPhase,
  getResearchDocument,
  requestPlanningApproval,
  revokePlanningApproval,
  savePlanningDocument,
  setTicketWorkflowPhase,
  type ApprovalState,
  type PhaseDocumentResponse,
  type PlanningRunResponse,
  type ResearchRunResponse,
  saveResearchDocument,
} from '@/service/api/ticket-api'
import {
  CheckCircledIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  RotateCounterClockwiseIcon,
  CrossCircledIcon,
  ExternalLinkIcon,
  Pencil1Icon,
  PlayIcon,
  ReaderIcon,
} from '@radix-ui/react-icons'
import type { AgentSession, AgentSessionMode } from '@/service/api/session-api'
import { type TicketWorkflowPhase, type Ticket, type Clanker } from '@viberglass/types'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { PhaseLogs } from './phase-logs'
import { PhaseSessionPanel, PhaseNoSession } from './phase-session-panel'
import { JobListItem } from '@/service/api/job-api'
import { PhaseDocumentComments } from './phase-document-comments'
import { getPhaseRunStatusBadgeColor } from './phase-document-ui'

interface PhaseSectionProps {
  ticket: Ticket
  clankers: Clanker[]
  project: string
  phase: 'research' | 'planning' | 'execution'
  currentPhase: TicketWorkflowPhase
  activeSession: AgentSession | null
  onStartSession: (mode: AgentSessionMode, prefilledMessage: string) => void
  onSendToSession: (message: string, mode: AgentSessionMode) => void
  onSessionEnded: () => void
  onWorkflowPhaseChange?: (phase: Ticket['workflowPhase']) => void
  onApprovalStateChange?: (state: ApprovalState) => void
  jobs: JobListItem[]
  documentRefreshKey?: number
}

function PhaseHeader({
  phase,
  status,
  isCurrent,
  isExpanded,
  onToggle,
}: {
  phase: 'research' | 'planning' | 'execution'
  status: 'completed' | 'in_progress' | 'upcoming'
  isCurrent: boolean
  isExpanded: boolean
  onToggle: () => void
}) {
  const labels = {
    research: 'Research',
    planning: 'Planning',
    execution: 'Execution',
  }

  const statusConfig: Record<'completed' | 'in_progress' | 'upcoming', { label: string; color: 'green' | 'blue' | 'zinc' }> = {
    completed: { label: 'Complete', color: 'green' },
    in_progress: { label: 'In Progress', color: 'blue' },
    upcoming: { label: 'Upcoming', color: 'zinc' },
  }

  const config = statusConfig[status]

  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex w-full items-center justify-between rounded-lg border border-[var(--gray-5)] bg-[var(--gray-1)] px-4 py-3 text-left transition-colors hover:bg-[var(--gray-2)]"
    >
      <div className="flex items-center gap-3">
        <div
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold"
          style={{
            backgroundColor: status === 'completed' 
              ? 'var(--green-9)' 
              : status === 'in_progress' 
                ? 'var(--accent-9)' 
                : 'var(--gray-4)',
            color: status === 'upcoming' ? 'var(--gray-9)' : 'white',
          }}
        >
          {status === 'completed' ? (
            <CheckCircledIcon className="h-4 w-4" />
          ) : (
            <span>{phase === 'research' ? '1' : phase === 'planning' ? '2' : '3'}</span>
          )}
        </div>
        <span className="text-sm font-semibold text-[var(--gray-12)]">{labels[phase]}</span>
        <Badge color={config.color} className="text-xs">
          {config.label}
        </Badge>
        {isCurrent && <span className="text-xs text-[var(--accent-11)]">(Current)</span>}
      </div>
      <div className="flex items-center gap-2">
        {isExpanded ? (
          <ChevronDownIcon className="h-4 w-4 text-[var(--gray-9)]" />
        ) : (
          <ChevronRightIcon className="h-4 w-4 text-[var(--gray-9)]" />
        )}
      </div>
    </button>
  )
}

export function PhaseSection({
  ticket,
  clankers,
  project,
  phase,
  currentPhase,
  activeSession,
  onStartSession,
  onSendToSession,
  onSessionEnded,
  onWorkflowPhaseChange,
  onApprovalStateChange,
  jobs,
  documentRefreshKey,
}: PhaseSectionProps) {
  const navigate = useNavigate()
  const [isExpanded, setIsExpanded] = useState(phase === currentPhase)
  const [document, setDocument] = useState<PhaseDocumentResponse | null>(null)
  const [latestRun, setLatestRun] = useState<ResearchRunResponse | PlanningRunResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [isRunModalOpen, setIsRunModalOpen] = useState(false)
  const [isApproving, setIsApproving] = useState(false)
  const [draft, setDraft] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const isCurrentPhase = phase === currentPhase
  const phaseIndex = ['research', 'planning', 'execution'].indexOf(phase)
  const currentIndex = ['research', 'planning', 'execution'].indexOf(currentPhase)

  const status: 'completed' | 'in_progress' | 'upcoming' =
    phaseIndex < currentIndex ? 'completed' : phaseIndex === currentIndex ? 'in_progress' : 'upcoming'

  const loadDocument = useCallback(async () => {
    try {
      if (phase === 'research') {
        const phaseData = await getResearchDocument(ticket.id)
        setDocument(phaseData.document)
        setLatestRun(phaseData.latestRun)
        setDraft(phaseData.document.content)
      } else if (phase === 'planning') {
        const phaseData = await getPlanningPhase(ticket.id)
        setDocument(phaseData.document)
        setLatestRun(phaseData.latestRun)
        setDraft(phaseData.document.content)
        onApprovalStateChange?.(phaseData.document.approvalState)
      }
    } finally {
      setIsLoading(false)
    }
  }, [ticket.id, phase, onApprovalStateChange])

  useEffect(() => {
    void loadDocument()
  }, [loadDocument])

  useEffect(() => {
    if (documentRefreshKey) void loadDocument()
  }, [documentRefreshKey, loadDocument])

  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus()
    }
  }, [isEditing])

  const handleSave = useCallback(async () => {
    try {
      setIsSaving(true)
      const saved = phase === 'research'
        ? await saveResearchDocument(ticket.id, draft)
        : await savePlanningDocument(ticket.id, draft)
      setDocument(saved)
      setIsEditing(false)
      toast.success(`${phase} document saved`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save')
    } finally {
      setIsSaving(false)
    }
  }, [ticket.id, draft, phase])

  const handleCancel = useCallback(() => {
    setDraft(document?.content ?? '')
    setIsEditing(false)
  }, [document])

  const handleApplySuggestion = useCallback(async (lineNumber: number, suggestedText: string) => {
    const lines = (document?.content ?? '').split('\n')
    lines[lineNumber - 1] = suggestedText
    const newContent = lines.join('\n')
    try {
      setIsSaving(true)
      const saved = phase === 'research'
        ? await saveResearchDocument(ticket.id, newContent)
        : await savePlanningDocument(ticket.id, newContent)
      setDocument(saved)
      setDraft(saved.content)
      toast.success(`Suggestion applied to line ${lineNumber}`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to apply suggestion')
      throw error
    } finally {
      setIsSaving(false)
    }
  }, [document, ticket.id, phase])

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

  const handleApproveResearch = useCallback(async () => {
    try {
      setIsApproving(true)
      await setTicketWorkflowPhase(ticket.id, 'planning')
      onWorkflowPhaseChange?.('planning')
      toast.success('Research approved - ticket advanced to planning')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to approve research')
    } finally {
      setIsApproving(false)
    }
  }, [ticket.id, onWorkflowPhaseChange])

  const isDirty = draft !== (document?.content ?? '')
  const hasContent = (document?.content ?? '').trim().length > 0
  const canEdit = phase === 'planning' || phase === 'execution' || (phase === 'research' && currentPhase === 'research')
  const canRequestApproval = phase === 'planning' && hasContent && document?.approvalState === 'draft'
  const canApprove = phase === 'planning' && document?.approvalState === 'approval_requested'
  const canRevoke = phase === 'planning' && document?.approvalState === 'approved'

  const sessionForPhase = activeSession?.mode === phase ? activeSession : null

  const handleRevise = useCallback(() => {
    onStartSession(phase, '')
  }, [onStartSession, phase])

  const handleStartSession = useCallback(() => {
    onStartSession(phase, '')
  }, [onStartSession, phase])

  return (
    <div className="space-y-2">
      <PhaseHeader
        phase={phase}
        status={status}
        isCurrent={isCurrentPhase}
        isExpanded={isExpanded}
        onToggle={() => setIsExpanded(!isExpanded)}
      />

      {isExpanded && (
        <div className="space-y-4 rounded-lg border border-[var(--gray-4)] bg-[var(--gray-2)] p-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="text-sm text-[var(--gray-9)]">Loading...</div>
            </div>
          ) : (
            <>
              {phase === 'execution' ? (
                <div className="space-y-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1.5">
                      <Subheading className="flex items-center gap-2">
                        <ReaderIcon className="h-5 w-5 text-[var(--accent-9)]" />
                        Execution Results
                      </Subheading>
                    </div>
                    <Button
                      color="brand"
                      onClick={() => setIsRunModalOpen(true)}
                      disabled={!isCurrentPhase}
                      title={isCurrentPhase ? 'Run Execution' : 'Execution only available in current phase'}
                    >
                      <PlayIcon className="h-3.5 w-3.5" />
                      Run Execution
                    </Button>
                  </div>

                  {ticket.pullRequestUrl ? (
                    <div className="flex items-center justify-between gap-3 rounded-lg border border-[var(--green-6)] bg-[var(--green-2)] p-4">
                      <div className="flex items-center gap-3">
                        <CheckCircledIcon className="h-5 w-5 text-[var(--green-9)]" />
                        <div>
                          <p className="text-sm font-medium text-[var(--gray-12)]">Pull Request Created</p>
                          <p className="text-xs text-[var(--gray-9)]">The agent has created a pull request for this ticket.</p>
                        </div>
                      </div>
                      <Button color="brand" href={ticket.pullRequestUrl} target="_blank">
                        <ExternalLinkIcon className="h-3.5 w-3.5" />
                        View Pull Request
                      </Button>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-[var(--gray-6)] bg-[var(--gray-2)] p-8 text-center">
                      <ReaderIcon className="h-8 w-8 text-[var(--gray-8)]" />
                      <div>
                        <p className="text-sm font-medium text-[var(--gray-11)]">No pull request yet</p>
                        <p className="mt-1 text-sm text-[var(--gray-9)]">
                          Run execution to generate a pull request for this ticket.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
              <div className="space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1.5">
                    <Subheading className="flex items-center gap-2">
                      <ReaderIcon className="h-5 w-5 text-[var(--accent-9)]" />
                      {phase === 'research' ? 'Research Document' : 'Planning Document'}
                    </Subheading>
                    {latestRun && (
                      <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--gray-9)]">
                        <Badge color={getPhaseRunStatusBadgeColor(latestRun.status)}>
                          {latestRun.status === 'active'
                            ? `${phase.charAt(0).toUpperCase() + phase.slice(1)} Running`
                            : `${phase.charAt(0).toUpperCase() + phase.slice(1)} ${latestRun.status}`}
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
                    {sessionForPhase && (
                      <Button plain onClick={handleRevise}>
                        {hasContent ? 'Revise with Agent' : 'Start Session'}
                      </Button>
                    )}
                    <Button
                      color="brand"
                      onClick={() => setIsRunModalOpen(true)}
                      disabled={!isCurrentPhase}
                      title={isCurrentPhase ? `Run ${phase}` : `${phase} only available in current phase`}
                    >
                      <PlayIcon className="h-3.5 w-3.5" />
                      {phase === 'research' ? 'Run Research' : 'Run Plan'}
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
                        title={canEdit ? 'Edit document' : 'Not editable in current phase'}
                      >
                        <Pencil1Icon className="h-3.5 w-3.5" />
                        Edit
                      </Button>
                    )}
                  </div>
                </div>

                {phase === 'planning' && document && (
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge color={
                      document.approvalState === 'approved' ? 'green' :
                      document.approvalState === 'approval_requested' ? 'amber' : 'zinc'
                    }>
                      {document.approvalState === 'draft' ? 'Draft' :
                       document.approvalState === 'approval_requested' ? 'Approval Requested' : 'Approved'}
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
                        size="small"
                      >
                        <CheckCircledIcon className="h-3.5 w-3.5" />
                        Request Approval
                      </Button>
                    )}
                    {canApprove && (
                      <Button color="green" onClick={handleApprove} disabled={isApproving} size="small">
                        <CheckCircledIcon className="h-3.5 w-3.5" />
                        {isApproving ? 'Approving...' : 'Approve'}
                      </Button>
                    )}
                    {canRevoke && (
                      <Button plain onClick={handleRevokeApproval} disabled={isApproving} size="small">
                        <CrossCircledIcon className="h-3.5 w-3.5" />
                        {isApproving ? 'Revoking...' : 'Revoke Approval'}
                      </Button>
                    )}
                  </div>
                )}

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
                    className="w-full min-h-[200px] resize-y rounded-lg border border-[var(--gray-6)] bg-[var(--gray-1)] p-4 font-mono text-sm text-[var(--gray-12)] placeholder:text-[var(--gray-8)] focus:border-[var(--accent-8)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-8)]"
                    placeholder={`Write ${phase} notes in markdown...`}
                  />
                ) : hasContent ? (
                  <PhaseDocumentComments
                    ticketId={ticket.id}
                    phase={phase}
                    content={document!.content}
                    onApplySuggestion={handleApplySuggestion}
                    activeSessionId={sessionForPhase?.id}
                    onSendToSession={(msg: string) => onSendToSession(msg, phase as 'research' | 'planning')}
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-[var(--gray-6)] bg-[var(--gray-2)] p-8 text-center">
                    <ReaderIcon className="h-8 w-8 text-[var(--gray-8)]" />
                    <div>
                      <p className="text-sm font-medium text-[var(--gray-11)]">No {phase} document yet</p>
                      <p className="mt-1 text-sm text-[var(--gray-9)]">
                        Run {phase} or click Edit to start writing.
                      </p>
                    </div>
                  </div>
                )}
              </div>
              )}

              <div className="space-y-3">
                <h4 className="text-sm font-medium text-[var(--gray-11)]">Agent Session</h4>
                {sessionForPhase ? (
                  <PhaseSessionPanel
                    session={sessionForPhase}
                    project={project}
                    onSessionEnded={onSessionEnded}
                    onRevise={handleRevise}
                  />
                ) : (
                  <PhaseNoSession mode={phase} onStartSession={handleStartSession} />
                )}
              </div>

              <div className="space-y-3">
                <PhaseLogs jobs={jobs} phase={phase} project={project} />
              </div>

              {isCurrentPhase && phase !== 'execution' && (
                <div className="flex items-center justify-between border-t border-[var(--gray-4)] pt-4">
                  <Button
                    outline
                    onClick={() => onStartSession(phase, '')}
                    className="text-xs"
                  >
                    <RotateCounterClockwiseIcon className="h-3.5 w-3.5" />
                    Restart from Fresh State
                  </Button>
                  {phase === 'research' && hasContent && (
                    <Button color="green" onClick={handleApproveResearch} disabled={isApproving}>
                      <CheckCircledIcon className="h-4 w-4" />
                      Approve Research & Continue
                    </Button>
                  )}
                  {phase === 'planning' && hasContent && (
                    <Button color="green" onClick={handleApprove} disabled={isApproving}>
                      <CheckCircledIcon className="h-4 w-4" />
                      Approve Planning & Continue
                    </Button>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}

      <RunTicketModal
        ticket={ticket}
        clankers={clankers}
        project={project}
        open={isRunModalOpen}
        onClose={() => {
          setIsRunModalOpen(false)
          void loadDocument()
        }}
        mode={phase}
      />
    </div>
  )
}