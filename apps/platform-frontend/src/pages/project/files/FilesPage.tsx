import { Button } from '@/components/button'
import { EmptyState } from '@/components/empty-state'
import { PageHeader } from '@/components/page-header'
import { PageMeta } from '@/components/page-meta'
import { Timestamp } from '@/components/timestamp'
import { useProject } from '@/context/project-context'
import { formatBytes } from '@/lib/artifacts'
import { deleteSpaceFile, downloadSpaceFile, getSpaceFiles, uploadSpaceFile } from '@/service/api/space-files-api'
import { FileTextIcon } from '@radix-ui/react-icons'
import type { SpaceFilesListing } from '@viberglass/types'
import { useCallback, useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { toast } from 'sonner'
import { DeleteFileDialog, NewTextFileDialog, UploadFileDialog } from './file-dialogs'
import { FilesTable } from './files-table'
import { TextFileEditor } from './text-file-editor'

const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? '' : 's'}`

/** A Files space's working files: what its agents and people share, kept between runs. */
export function FilesPage() {
  const { project, isLoading } = useProject()
  const [listing, setListing] = useState<SpaceFilesListing | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [editing, setEditing] = useState<{ path: string; isNew: boolean } | null>(null)
  const [uploading, setUploading] = useState(false)
  const [creating, setCreating] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const projectId = project?.id

  const load = useCallback(async () => {
    if (!projectId) return
    try {
      setListing(await getSpaceFiles(projectId))
      setLoadError(null)
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Couldn't load the space's files")
    }
  }, [projectId])

  useEffect(() => {
    void load()
  }, [load])

  if (isLoading) return <p className="py-20 text-center text-sm text-[var(--gray-10)]">Loading…</p>
  if (!project) return null
  if (project.backingKind !== 'files') return <Navigate to={`/spaces/${project.slug}`} replace />

  const canChange = Boolean(project.viewerAccess?.canCreateTasks)
  const files = listing?.files ?? []
  const snapshot = listing?.snapshot ?? null
  const download = (path: string) =>
    void downloadSpaceFile(project.id, path).catch((error: unknown) =>
      toast.error(error instanceof Error ? error.message : "Couldn't download the file")
    )

  return (
    <>
      <PageMeta title={`${project.name} | Files`} />
      <PageHeader
        eyebrow={`Files space · ${project.name}`}
        title="Files"
        description={
          snapshot ? (
            <span>
              {plural(snapshot.fileCount, 'file')} · {formatBytes(snapshot.totalBytes)} · saved <Timestamp date={snapshot.createdAt} />
            </span>
          ) : (
            'Shared by this space’s agents and people, and kept between runs.'
          )
        }
        actions={
          canChange && (
            <>
              <Button outline onClick={() => setCreating(true)} disabled={editing !== null}>
                New text file
              </Button>
              <Button color="brand" onClick={() => setUploading(true)}>
                Upload
              </Button>
            </>
          )
        }
      />

      {listing?.busy && (
        <p role="status" className="mb-4 rounded-md bg-[var(--gray-3)] px-4 py-3 text-sm text-[var(--gray-11)]">
          A run is changing these files right now. Uploads and edits wait until it has saved.
        </p>
      )}

      {editing && (
        <div className="mb-6">
          <TextFileEditor
            key={editing.path}
            projectId={project.id}
            path={editing.path}
            isNew={editing.isNew}
            onSaved={() => {
              setEditing((current) => (current ? { ...current, isNew: false } : null))
              void load()
            }}
            onClose={() => setEditing(null)}
          />
        </div>
      )}

      {loadError ? (
        <div className="space-y-3 text-sm">
          <p className="text-red-700 dark:text-red-400">{loadError}</p>
          <Button outline onClick={() => void load()}>
            Try again
          </Button>
        </div>
      ) : !listing ? (
        <p className="text-sm text-[var(--gray-10)]">Loading the files…</p>
      ) : files.length === 0 ? (
        <EmptyState
          icon={<FileTextIcon className="size-6" />}
          title="No files yet"
          description="Agents and people in this space share these files, and they stay here between runs. Upload a file, write one, or ask an agent in a task to create some."
        />
      ) : (
        <FilesTable
          files={files}
          canChange={canChange}
          onEdit={(path) => setEditing({ path, isNew: false })}
          onDownload={download}
          onDelete={setDeleting}
        />
      )}

      <UploadFileDialog
        open={uploading}
        onClose={() => setUploading(false)}
        onUpload={async (file, path) => {
          await uploadSpaceFile(project.id, file, path)
          toast.success(`Uploaded ${path}`)
          await load()
        }}
      />
      <NewTextFileDialog
        open={creating}
        existing={files.map((file) => file.path)}
        onClose={() => setCreating(false)}
        onCreate={(path) => setEditing({ path, isNew: true })}
      />
      <DeleteFileDialog
        path={deleting}
        onClose={() => setDeleting(null)}
        onDelete={async (path) => {
          await deleteSpaceFile(project.id, path)
          toast.success(`Deleted ${path}`)
          if (editing?.path === path) setEditing(null)
          await load()
        }}
      />
    </>
  )
}
