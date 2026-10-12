import { Button } from '@/components/button'
import { Dialog, DialogActions, DialogBody, DialogDescription, DialogTitle } from '@/components/dialog'
import { Description, Field, Label } from '@/components/fieldset'
import { Input } from '@/components/input'
import { formatBytes } from '@/lib/artifacts'
import { SPACE_UPLOAD_MAX_BYTES } from '@viberglass/types'
import { useState } from 'react'

/** A relative path inside the space's files, or why it isn't one. */
export function pathProblem(path: string): string | null {
  const trimmed = path.trim()
  if (!trimmed) return 'Give the file a name.'
  if (trimmed.startsWith('/') || trimmed.includes('\\')) return 'Use a path inside the space’s files, such as notes/brief.md.'
  if (trimmed.split('/').some((part) => part === '' || part === '.' || part === '..')) {
    return 'Use a path inside the space’s files, such as notes/brief.md.'
  }
  if (trimmed.split('/')[0] === '.viberglass') return 'That folder is kept for Viberglass.'
  return null
}

export function UploadFileDialog({
  open,
  onClose,
  onUpload,
}: {
  open: boolean
  onClose: () => void
  onUpload: (file: File, path: string) => Promise<void>
}) {
  const [file, setFile] = useState<File | null>(null)
  const [path, setPath] = useState('')
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const close = () => {
    setFile(null)
    setPath('')
    setError(null)
    onClose()
  }
  const tooLarge = file !== null && file.size > SPACE_UPLOAD_MAX_BYTES
  const problem = file ? (tooLarge ? `Files up to ${formatBytes(SPACE_UPLOAD_MAX_BYTES)} can be uploaded.` : pathProblem(path)) : null

  const upload = async () => {
    if (!file || problem) return
    setIsUploading(true)
    setError(null)
    try {
      await onUpload(file, path.trim())
      close()
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Couldn't upload the file")
    } finally {
      setIsUploading(false)
    }
  }

  return (
    <Dialog open={open} onClose={() => !isUploading && close()} size="md">
      <DialogTitle>Upload a file</DialogTitle>
      <DialogDescription>It joins the space’s files, where agents and people can use it in any task.</DialogDescription>
      <DialogBody className="space-y-5">
        <Field>
          <Label>File</Label>
          <input
            type="file"
            aria-label="File"
            className="mt-2 block text-sm"
            onChange={(event) => {
              const chosen = event.target.files?.[0] ?? null
              setFile(chosen)
              if (chosen && !path) setPath(chosen.name)
            }}
          />
        </Field>
        <Field>
          <Label>Save as</Label>
          <Input value={path} onChange={(event) => setPath(event.target.value)} placeholder="notes/brief.md" />
          <Description>A path in the space’s files. A file already there is replaced.</Description>
        </Field>
        {(problem || error) && <p className="text-sm text-red-700 dark:text-red-400">{error ?? problem}</p>}
      </DialogBody>
      <DialogActions>
        <Button outline onClick={close} disabled={isUploading}>
          Cancel
        </Button>
        <Button color="brand" onClick={() => void upload()} disabled={!file || Boolean(problem) || isUploading}>
          {isUploading ? 'Uploading…' : 'Upload'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

export function NewTextFileDialog({
  open,
  existing,
  onClose,
  onCreate,
}: {
  open: boolean
  existing: string[]
  onClose: () => void
  onCreate: (path: string) => void
}) {
  const [path, setPath] = useState('')
  const trimmed = path.trim()
  const problem = path ? (existing.includes(trimmed) ? 'A file with that path exists; edit it instead.' : pathProblem(path)) : null
  const close = () => {
    setPath('')
    onClose()
  }
  return (
    <Dialog open={open} onClose={close} size="md">
      <DialogTitle>New text file</DialogTitle>
      <DialogDescription>A Markdown or plain-text file in the space’s files.</DialogDescription>
      <DialogBody>
        <Field>
          <Label>Path</Label>
          <Input autoFocus value={path} onChange={(event) => setPath(event.target.value)} placeholder="notes/brief.md" />
        </Field>
        {problem && <p className="mt-3 text-sm text-red-700 dark:text-red-400">{problem}</p>}
      </DialogBody>
      <DialogActions>
        <Button outline onClick={close}>
          Cancel
        </Button>
        <Button
          color="brand"
          disabled={!trimmed || Boolean(problem)}
          onClick={() => {
            onCreate(trimmed)
            close()
          }}
        >
          Create
        </Button>
      </DialogActions>
    </Dialog>
  )
}

export function DeleteFileDialog({
  path,
  onClose,
  onDelete,
}: {
  path: string | null
  onClose: () => void
  onDelete: (path: string) => Promise<void>
}) {
  const [isDeleting, setIsDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const remove = async () => {
    if (!path) return
    setIsDeleting(true)
    setError(null)
    try {
      await onDelete(path)
      onClose()
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Couldn't delete the file")
    } finally {
      setIsDeleting(false)
    }
  }
  return (
    <Dialog open={path !== null} onClose={() => !isDeleting && onClose()} size="md">
      <DialogTitle>Delete {path}?</DialogTitle>
      <DialogDescription>
        Agents and people won’t see it in the space’s files any more. Artifact versions made from it keep their copy.
      </DialogDescription>
      {error && <p className="mt-4 text-sm text-red-700 dark:text-red-400">{error}</p>}
      <DialogActions>
        <Button outline onClick={onClose} disabled={isDeleting}>
          Cancel
        </Button>
        <Button color="red" onClick={() => void remove()} disabled={isDeleting}>
          {isDeleting ? 'Deleting…' : 'Delete'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
