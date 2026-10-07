import { Button } from '@/components/button'
import { Dialog, DialogActions, DialogBody, DialogDescription, DialogTitle } from '@/components/dialog'
import { Dropdown, DropdownButton, DropdownItem, DropdownMenu } from '@/components/dropdown'
import { deactivateClanker, deleteClanker, startClanker } from '@/service/api/clanker-api'
import { ChevronDownIcon, Pencil1Icon, PlayIcon, StopIcon, TrashIcon } from '@radix-ui/react-icons'
import type { Clanker } from '@viberglass/types'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

export function canStartClanker(clanker: Clanker): boolean {
  return clanker.status === 'inactive' || clanker.status === 'failed'
}

interface StartClankerButtonProps {
  clanker: Clanker
  /** The agents list shows it as a secondary action on a card; the agent's page as its primary one. */
  outline?: boolean
  /** Away from the agent's own page the button has to say what it starts. */
  name?: string
  onClankerUpdated?: (clanker: Clanker) => void
  onError: (message: string | null) => void
}

export function StartClankerButton({ clanker, outline, name = 'Start', onClankerUpdated, onError }: StartClankerButtonProps) {
  const [isStarting, setIsStarting] = useState(false)

  async function handleStart() {
    setIsStarting(true)
    onError(null)
    try {
      const updatedClanker = await startClanker(clanker.id)
      if (onClankerUpdated) {
        onClankerUpdated(updatedClanker)
      } else {
        window.location.reload()
      }
    } catch (error) {
      console.error('Failed to start agent:', error)
      onError(error instanceof Error ? error.message : 'Failed to start the agent')
    } finally {
      setIsStarting(false)
    }
  }

  const label = (
    <>
      <PlayIcon />
      {isStarting ? 'Starting...' : name}
    </>
  )
  return outline ? (
    <Button outline disabled={isStarting} onClick={handleStart}>
      {label}
    </Button>
  ) : (
    <Button color="brand" disabled={isStarting} onClick={handleStart}>
      {label}
    </Button>
  )
}

interface ClankerActionsProps {
  clanker: Clanker
  onClankerUpdated?: (clanker: Clanker) => void
}

export function ClankerActions({ clanker, onClankerUpdated }: ClankerActionsProps) {
  const navigate = useNavigate()
  const [isDeleting, setIsDeleting] = useState(false)
  const [isDeactivating, setIsDeactivating] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)

  const canDeactivate = clanker.status === 'active' || clanker.status === 'deploying'

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
      console.error('Failed to deactivate agent:', error)
      setActionError(error instanceof Error ? error.message : 'Failed to deactivate the agent')
    } finally {
      setIsDeactivating(false)
    }
  }

  async function handleDelete() {
    setActionError(null)
    setIsDeleting(true)
    try {
      await deleteClanker(clanker.id)
      navigate('/settings/agents')
    } catch (error) {
      console.error('Failed to delete agent:', error)
      setActionError(error instanceof Error ? error.message : 'Failed to delete the agent')
      setIsDeleting(false)
      setShowDeleteDialog(false)
    }
  }

  return (
    <>
      {canStartClanker(clanker) && (
        <StartClankerButton clanker={clanker} onClankerUpdated={onClankerUpdated} onError={setActionError} />
      )}

      {canDeactivate && (
        <Button outline disabled={isDeactivating} onClick={handleDeactivate}>
          <StopIcon />
          {isDeactivating ? 'Deactivating...' : 'Deactivate'}
        </Button>
      )}

      <Dropdown>
        <DropdownButton outline>
          Actions
          <ChevronDownIcon data-slot="icon" />
        </DropdownButton>
        <DropdownMenu align="end">
          <DropdownItem href={`/settings/agents/${clanker.slug}/edit`}>
            <Pencil1Icon className="size-4" />
            Edit agent
          </DropdownItem>
          <DropdownItem onClick={() => setShowDeleteDialog(true)} className="text-red-600">
            <TrashIcon className="size-4" />
            Delete agent
          </DropdownItem>
        </DropdownMenu>
      </Dropdown>

      <Dialog open={showDeleteDialog} onClose={() => setShowDeleteDialog(false)}>
        <DialogTitle>Delete agent</DialogTitle>
        <DialogDescription>
          Are you sure you want to delete &quot;{clanker.name}&quot;? This action cannot be undone.
        </DialogDescription>
        <DialogBody>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Tasks can no longer use this agent. Past runs and their records are kept.
          </p>
        </DialogBody>
        <DialogActions>
          <Button outline onClick={() => setShowDeleteDialog(false)}>
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
