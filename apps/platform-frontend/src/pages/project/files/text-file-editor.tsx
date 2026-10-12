import { Button } from '@/components/button'
import { Textarea } from '@/components/textarea'
import { getSpaceTextFile, saveSpaceTextFile, SpaceRequestError } from '@/service/api/space-files-api'
import type { SpaceTextFile } from '@viberglass/types'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

type Problem = { kind: 'changed' } | { kind: 'busy' } | { kind: 'failed'; message: string }

const PROBLEM_TEXT: Record<Problem['kind'], string> = {
  changed:
    'Someone changed this file since you opened it, so your save was refused. Your text is still here: copy what you need, then load their version.',
  busy: 'A run is saving this space’s files right now. Your text is still here; save again in a moment.',
  failed: '',
}

/**
 * Edits one Markdown or plain-text file. Saving sends the hash of the file as
 * it was opened, so a change someone else saved meanwhile is never overwritten.
 */
export function TextFileEditor({
  projectId,
  path,
  isNew,
  onSaved,
  onClose,
}: {
  projectId: string
  path: string
  /** A file that doesn't exist yet: it starts empty and saving creates it. */
  isNew: boolean
  onSaved: () => void
  onClose: () => void
}) {
  const [opened, setOpened] = useState<SpaceTextFile | null>(isNew ? { path, content: '', sha256: '' } : null)
  const [text, setText] = useState('')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [problem, setProblem] = useState<Problem | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const load = async () => {
    setLoadError(null)
    try {
      const file = await getSpaceTextFile(projectId, path)
      setOpened(file)
      setText(file.content)
      setProblem(null)
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Couldn't open the file")
    }
  }

  useEffect(() => {
    if (!isNew) void load()
    // Opening another file remounts the editor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const save = async () => {
    if (!opened) return
    setIsSaving(true)
    setProblem(null)
    try {
      const saved = await saveSpaceTextFile(projectId, {
        path,
        content: text,
        baseSha256: isNew && !opened.sha256 ? null : opened.sha256,
      })
      setOpened(saved.file)
      toast.success(`Saved ${path}`)
      onSaved()
    } catch (error) {
      if (error instanceof SpaceRequestError && error.code === 'FILE_CHANGED') setProblem({ kind: 'changed' })
      else if (error instanceof SpaceRequestError && error.code === 'SPACE_BUSY') setProblem({ kind: 'busy' })
      else setProblem({ kind: 'failed', message: error instanceof Error ? error.message : "Couldn't save the file" })
    } finally {
      setIsSaving(false)
    }
  }

  const changed = opened !== null && text !== opened.content

  return (
    <section
      aria-label={`Editing ${path}`}
      className="rounded-[9px] border border-[var(--gray-5)] bg-[var(--color-panel-solid)] p-5 max-sm:px-3"
    >
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold text-[var(--gray-12)]">{isNew ? `New file ${path}` : `Editing ${path}`}</h2>
        <p className="text-xs text-[var(--gray-10)]">Markdown or plain text. Saving keeps a new version of the space’s files.</p>
      </div>

      {loadError ? (
        <div className="space-y-3 text-sm">
          <p className="text-red-700 dark:text-red-400">{loadError}</p>
          <div className="flex gap-2">
            <Button outline onClick={onClose}>
              Close
            </Button>
            <Button outline onClick={() => void load()}>
              Try again
            </Button>
          </div>
        </div>
      ) : !opened ? (
        <p className="text-sm text-[var(--gray-10)]">Opening the file…</p>
      ) : (
        <>
          <Textarea
            aria-label={`Content of ${path}`}
            value={text}
            onChange={(event) => setText(event.target.value)}
            rows={20}
            className="font-mono text-sm"
          />
          {problem && (
            <div role="alert" className="mt-3 rounded-md bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-900/20 dark:text-amber-200">
              <p>{problem.kind === 'failed' ? problem.message : PROBLEM_TEXT[problem.kind]}</p>
              {problem.kind === 'changed' && (
                <Button outline size="small" className="mt-2" onClick={() => void load()}>
                  Load their version
                </Button>
              )}
            </div>
          )}
          <div className="mt-4 flex justify-end gap-2">
            <Button outline onClick={onClose}>
              Cancel
            </Button>
            <Button color="brand" onClick={() => void save()} disabled={isSaving || (!isNew && !changed)}>
              {isSaving ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </>
      )}
    </section>
  )
}
