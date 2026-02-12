import { Button } from '@/components/button'
import { Dialog, DialogActions, DialogBody, DialogDescription, DialogTitle } from '@/components/dialog'
import { deleteClanker, startClanker, stopClanker } from '@/service/api/clanker-api'
import { PlayIcon, StopIcon, TrashIcon } from '@radix-ui/react-icons'
import type { Clanker } from '@viberglass/types'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

interface ClankerActionsProps {
  clanker: Clanker
}

export function ClankerActions({ clanker }: ClankerActionsProps) {
  const navigate = useNavigate()
  const [isDeleting, setIsDeleting] = useState(false)
  const [isStarting, setIsStarting] = useState(false)
  const [isStopping, setIsStopping] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)

  const canStart = clanker.status === 'inactive' || clanker.status === 'failed'
  const canStop = clanker.status === 'active' || clanker.status === 'deploying'

  async function handleStart() {
    setIsStarting(true)
    try {
      await startClanker(clanker.id)
      window.location.reload()
    } catch (error) {
      console.error('Failed to start clanker:', error)
    } finally {
      setIsStarting(false)
    }
  }

  async function handleStop() {
    setIsStopping(true)
    try {
      await stopClanker(clanker.id)
      window.location.reload()
    } catch (error) {
      console.error('Failed to stop clanker:', error)
    } finally {
      setIsStopping(false)
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

      {canStop && (
        <Button color="amber" disabled={isStopping} onClick={handleStop}>
          <StopIcon />
          {isStopping ? 'Stopping...' : 'Stop'}
        </Button>
      )}

      <Button
        plain
        onClick={() => setShowDeleteDialog(true)}
        className="!inline-flex !h-9 !items-center !justify-center !rounded-md !px-3 !text-red-700 hover:!bg-red-50 hover:!text-red-800 dark:!text-red-300 dark:hover:!bg-red-500/10 dark:hover:!text-red-200"
      >
        <TrashIcon />
        Delete
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
    </>
  )
}
