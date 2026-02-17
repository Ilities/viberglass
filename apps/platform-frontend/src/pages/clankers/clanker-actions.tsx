import { Button } from '@/components/button'
import { Dialog, DialogActions, DialogBody, DialogDescription, DialogTitle } from '@/components/dialog'
import { deactivateClanker, deleteClanker, startClanker } from '@/service/api/clanker-api'
import { PlayIcon, StopIcon, TrashIcon } from '@radix-ui/react-icons'
import type { Clanker } from '@viberglass/types'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

interface ClankerActionsProps {
  clanker: Clanker
  onClankerUpdated?: (clanker: Clanker) => void
}

export function ClankerActions({ clanker, onClankerUpdated }: ClankerActionsProps) {
  const navigate = useNavigate()
  const [isDeleting, setIsDeleting] = useState(false)
  const [isStarting, setIsStarting] = useState(false)
  const [isDeactivating, setIsDeactivating] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)

  const canStart = clanker.status === 'inactive' || clanker.status === 'failed'
  const canDeactivate = clanker.status === 'active' || clanker.status === 'deploying'

  async function handleStart() {
    setIsStarting(true)
    setActionError(null)
    try {
      const updatedClanker = await startClanker(clanker.id)
      if (onClankerUpdated) {
        onClankerUpdated(updatedClanker)
      } else {
        window.location.reload()
      }
    } catch (error) {
      console.error('Failed to start clanker:', error)
      setActionError(error instanceof Error ? error.message : 'Failed to start clanker')
    } finally {
      setIsStarting(false)
    }
  }

  async function handleDeactivate() {
    setIsDeactivating(true)
    setActionError(null)
    try {
      const updatedClanker = await deactivateClanker(clanker.id)
      if (onClankerUpdated) {
        onClankerUpdated(updatedClanker)
      } else {
        window.location.reload()
      }
    } catch (error) {
      console.error('Failed to deactivate clanker:', error)
      setActionError(error instanceof Error ? error.message : 'Failed to deactivate clanker')
    } finally {
      setIsDeactivating(false)
    }
  }

  async function handleDelete() {
    setIsDeleting(true)
    try {
      await deleteClanker(clanker.id)
      navigate('/clankers')
    } catch (error) {
      console.error('Failed to delete clanker:', error)
      setIsDeleting(false)
      setShowDeleteDialog(false)
    }
  }

  return (
    <>
      {canStart && (
        <Button color="green" disabled={isStarting} onClick={handleStart}>
          <PlayIcon />
          {isStarting ? 'Starting...' : 'Start'}
        </Button>
      )}

      {canDeactivate && (
        <Button color="amber" disabled={isDeactivating} onClick={handleDeactivate}>
          <StopIcon />
          {isDeactivating ? 'Deactivating...' : 'Deactivate'}
        </Button>
      )}

      <Button
        surface
        color="red"
        onClick={() => setShowDeleteDialog(true)}
        aria-label="Delete clanker"
      >
        <TrashIcon />
      </Button>

      <Dialog open={showDeleteDialog} onClose={() => setShowDeleteDialog(false)}>
        <DialogTitle>Delete Clanker</DialogTitle>
        <DialogDescription>
          Are you sure you want to delete &quot;{clanker.name}&quot;? This action cannot be undone.
        </DialogDescription>
        <DialogBody>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            All configuration and settings for this clanker will be permanently removed.
          </p>
        </DialogBody>
        <DialogActions>
          <Button plain onClick={() => setShowDeleteDialog(false)}>
            Cancel
          </Button>
          <Button color="red" disabled={isDeleting} onClick={handleDelete}>
            {isDeleting ? 'Deleting...' : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>

      {actionError && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {actionError}
        </p>
      )}
    </>
  )
}
