import { Button } from '@/components/button'
import { Subheading } from '@/components/heading'
import {
  type PhaseDocumentResponse,
  getPlanningDocument,
  savePlanningDocument,
} from '@/service/api/ticket-api'
import { Pencil1Icon, ReaderIcon } from '@radix-ui/react-icons'
import type { Ticket } from '@viberglass/types'
import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

interface PlanningDocumentPanelProps {
  ticket: Ticket
}

export function PlanningDocumentPanel({ ticket }: PlanningDocumentPanelProps) {
  const [document, setDocument] = useState<PhaseDocumentResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const load = useCallback(async () => {
    try {
      const phase = await getPlanningDocument(ticket.id)
      setDocument(phase)
      setDraft(phase.content)
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
      const saved = await savePlanningDocument(ticket.id, draft)
      setDocument(saved)
      setIsEditing(false)
      toast.success('Planning document saved')
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
  const canEdit = ticket.workflowPhase === 'planning' || ticket.workflowPhase === 'execution'

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-sm text-[var(--gray-9)]">Loading planning document...</div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-2">
            <Subheading className="flex items-center gap-2">
              <ReaderIcon className="h-5 w-5 text-[var(--accent-9)]" />
              Planning Document
            </Subheading>
          </div>

          <div className="flex items-center gap-2">
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
            placeholder="Write planning notes in markdown..."
          />
        ) : hasContent ? (
          <div className="prose prose-sm max-w-none whitespace-pre-wrap rounded-lg border border-[var(--gray-6)] bg-[var(--gray-1)] p-4 text-sm text-[var(--gray-11)]">
            {document!.content}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-[var(--gray-6)] bg-[var(--gray-2)] p-12 text-center">
            <ReaderIcon className="h-8 w-8 text-[var(--gray-8)]" />
            <div>
              <p className="text-sm font-medium text-[var(--gray-11)]">No planning document yet</p>
              <p className="mt-1 text-sm text-[var(--gray-9)]">
                Click Edit to start writing planning notes for this ticket.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
