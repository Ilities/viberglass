import { Dropdown, DropdownButton, DropdownDivider, DropdownItem, DropdownMenu } from '@/components/dropdown'
import { taskPath } from '@/lib/taskPath'
import { ArchiveIcon, CheckCircledIcon, ChevronDownIcon, Link2Icon, Pencil1Icon, ResetIcon, TrashIcon, EyeOpenIcon } from '@radix-ui/react-icons'
import { TICKET_STATUS, type TaskCapabilities, type Ticket } from '@viberglass/types'
import { toast } from 'sonner'

interface TaskActionsMenuProps {
  ticket: Ticket
  space: string
  capabilities: TaskCapabilities | null
  onEdit: () => void
  onSetDone: (done: boolean) => void
  onArchive: () => void
  onDelete: () => void
}

/** Housekeeping on a task, only the items this person may use. */
export function TaskActionsMenu({ ticket, space, capabilities, onEdit, onSetDone, onArchive, onDelete }: TaskActionsMenuProps) {
  const canEdit = Boolean(capabilities?.canEdit)
  const canDelete = Boolean(capabilities?.canDelete)
  const done = ticket.status === TICKET_STATUS.RESOLVED

  return (
    <Dropdown>
      <DropdownButton outline className="shrink-0">
        Actions
        <ChevronDownIcon data-slot="icon" />
      </DropdownButton>
      <DropdownMenu>
        {canEdit && (
          <DropdownItem onClick={onEdit}>
            <Pencil1Icon className="size-4" />
            Edit details
          </DropdownItem>
        )}
        {ticket.screenshot && (
          <DropdownItem href={`/spaces/${space}/tasks/${ticket.id}/media`}>
            <EyeOpenIcon className="size-4" />
            View screenshots
          </DropdownItem>
        )}
        <DropdownItem
          onClick={() => {
            void navigator.clipboard.writeText(`${window.location.origin}${taskPath(space, ticket)}`)
            toast.success('Link copied')
          }}
        >
          <Link2Icon className="size-4" />
          Copy link
        </DropdownItem>
        {canEdit && (
          <>
            <DropdownDivider />
            <DropdownItem onClick={() => onSetDone(!done)}>
              {done ? <ResetIcon className="size-4" /> : <CheckCircledIcon className="size-4" />}
              {done ? 'Reopen task' : 'Finish task'}
            </DropdownItem>
            {!ticket.archivedAt && (
              <DropdownItem onClick={onArchive}>
                <ArchiveIcon className="size-4" />
                Archive
              </DropdownItem>
            )}
          </>
        )}
        {canDelete && (
          <DropdownItem onClick={onDelete} className="text-red-600">
            <TrashIcon className="size-4" />
            Delete task
          </DropdownItem>
        )}
      </DropdownMenu>
    </Dropdown>
  )
}
