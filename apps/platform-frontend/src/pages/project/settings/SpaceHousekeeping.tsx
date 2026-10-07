import { Button } from '@/components/button'
import { Dialog, DialogActions, DialogBody, DialogDescription, DialogTitle } from '@/components/dialog'
import { Input } from '@/components/input'
import { useAuth } from '@/context/auth-context'
import { getErrorMessage } from '@/lib/project-form'
import {
  archiveProject,
  deleteProject,
  getProjectDeletionSummary,
  type Project,
  type ProjectDeletionSummary,
} from '@/service/api/project-api'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

/** Archiving a space for its maintainers, and deleting it for admins. */
export function SpaceHousekeeping({ project }: { project: Project }) {
  const navigate = useNavigate()
  const isAdmin = useAuth().user?.role === 'admin'
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [deleteConfirmName, setDeleteConfirmName] = useState('')
  const [isDeleting, setIsDeleting] = useState(false)
  const [isArchiving, setIsArchiving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [deletionSummary, setDeletionSummary] = useState<ProjectDeletionSummary | null>(null)

  async function handleDelete() {
    setIsDeleting(true)
    setError(null)
    try {
      await deleteProject(project.id)
      navigate('/')
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to delete space'))
      setIsDeleting(false)
    }
  }

  async function handleArchive() {
    setIsArchiving(true)
    setError(null)
    try {
      await archiveProject(project.id)
      navigate('/')
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to archive space'))
      setIsArchiving(false)
    }
  }

  function openDeleteDialog() {
    setDeleteConfirmName('')
    setError(null)
    setShowDeleteDialog(true)
    void getProjectDeletionSummary(project.id)
      .then(setDeletionSummary)
      .catch(() => setDeletionSummary(null))
  }

  return (
    <>
      <div className="mt-16 space-y-6 border-t border-zinc-200 pt-8 dark:border-zinc-800">
        {error && !showDeleteDialog && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        <div className="rounded-xl border border-zinc-200 bg-zinc-50/50 p-6 dark:border-zinc-800 dark:bg-zinc-900/50">
          <h3 className="text-base font-semibold text-zinc-900 dark:text-white">Archive space</h3>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Hides it from lists. Its tasks, runs and settings stay.
          </p>
          <Button className="mt-4" outline disabled={isArchiving} onClick={() => void handleArchive()}>
            {isArchiving ? 'Archiving…' : 'Archive space'}
          </Button>
        </div>
        {isAdmin && (
          <div className="rounded-xl border border-red-200 bg-red-50/50 p-6 dark:border-red-900/50 dark:bg-red-950/20">
            <h3 className="text-base font-semibold text-red-700 dark:text-red-400">Danger zone</h3>
            <p className="mt-1 text-sm text-red-600/80 dark:text-red-400/80">
              Deletes the space and everything in it, for good.
            </p>
            <Button className="mt-4" color="red" onClick={openDeleteDialog}>
              Delete space
            </Button>
          </div>
        )}
      </div>

      <Dialog
        open={showDeleteDialog}
        onClose={(open) => {
          if (!isDeleting) setShowDeleteDialog(open)
        }}
        size="md"
      >
        <DialogTitle>Delete space</DialogTitle>
        <DialogDescription>
          This permanently deletes <strong>{project.name}</strong> and all its tasks, runs and settings.
        </DialogDescription>
        <DialogBody>
          <div className="space-y-3">
            {deletionSummary ? (
              <p className="rounded-lg bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950/40 dark:text-red-200">
                Also deleted: {deletionSummary.tickets} tasks, {deletionSummary.runs} runs, {deletionSummary.sessions}{' '}
                agent sessions, and {deletionSummary.schedules} schedules.
              </p>
            ) : null}
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Type <strong className="font-mono text-zinc-900 dark:text-white">{project.name}</strong> to confirm.
            </p>
            <Input
              value={deleteConfirmName}
              onChange={(event) => setDeleteConfirmName(event.target.value)}
              placeholder={project.name}
              disabled={isDeleting}
            />
            {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          </div>
        </DialogBody>
        <DialogActions>
          <Button outline onClick={() => setShowDeleteDialog(false)} disabled={isDeleting}>
            Cancel
          </Button>
          <Button outline onClick={() => void handleArchive()} disabled={isDeleting || isArchiving}>
            {isArchiving ? 'Archiving…' : 'Archive instead'}
          </Button>
          <Button
            color="red"
            onClick={() => void handleDelete()}
            disabled={isDeleting || deleteConfirmName !== project.name}
          >
            {isDeleting ? 'Deleting…' : 'Delete space'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  )
}
