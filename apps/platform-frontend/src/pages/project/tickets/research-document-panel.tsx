import { Badge } from '@/components/badge'
import { Button } from '@/components/button'
import { RunTicketModal } from '@/components/run-ticket-modal'
import { Subheading } from '@/components/heading'
import {
  getResearchDocument,
  saveResearchDocument,
  type PhaseDocumentResponse,
  type ResearchRunResponse,
} from '@/service/api/ticket-api'
import { Pencil1Icon, PlayIcon, ReaderIcon } from '@radix-ui/react-icons'
import type { Clanker, Ticket } from '@viberglass/types'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'

interface ResearchDocumentPanelProps {
  ticket: Ticket
  clankers: Clanker[]
  project: string
}

function getStatusBadgeColor(status: ResearchRunResponse['status']): 'amber' | 'green' | 'red' | 'zinc' {
  switch (status) {
    case 'queued':
    case 'active':
      return 'amber'
    case 'completed':
      return 'green'
    case 'failed':
      return 'red'
    default:
      return 'zinc'
  }
}

export function ResearchDocumentPanel({ ticket, clankers, project }: ResearchDocumentPanelProps) {
  const navigate = useNavigate()
  const [document, setDocument] = useState<PhaseDocumentResponse | null>(null)
  const [latestRun, setLatestRun] = useState<ResearchRunResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [isRunModalOpen, setIsRunModalOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const load = useCallback(async () => {
    try {
      const phase = await getResearchDocument(ticket.id)
      setDocument(phase.document)
      setLatestRun(phase.latestRun)
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
      setDocument(saved)
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

  const isDirty = draft !== (document?.content ?? '')
  const hasContent = (document?.content ?? '').trim().length > 0

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-sm text-[var(--gray-9)]">Loading research document...</div>
      </div>
    )
  }

  return (
    <>
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-2">
            <Subheading className="flex items-center gap-2">
              <ReaderIcon className="h-5 w-5 text-[var(--accent-9)]" />
              Research Document
            </Subheading>
            {latestRun && (
              <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--gray-9)]">
                <Badge color={getStatusBadgeColor(latestRun.status)}>
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
          <div className="prose prose-sm max-w-none whitespace-pre-wrap rounded-lg border border-[var(--gray-6)] bg-[var(--gray-1)] p-4 text-sm text-[var(--gray-11)]">
            {document!.content}
          </div>
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
