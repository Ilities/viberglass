import { Badge } from '@/components/badge'
import { Button } from '@/components/button'
import { Checkbox } from '@/components/checkbox'
import { ListRow, MetaLine } from '@/components/list-panel'
import { taskPath } from '@/lib/taskPath'
import { quotedLastMessage, turnLine } from '@/pages/home/home-threads'
import type { Ticket } from '@viberglass/types'
import { statusUnder, type SpaceGroup } from './space-groups'

interface SpaceTaskRowProps {
  task: Ticket
  space: string
  /** Set only for people who may archive, who get a checkbox. */
  selection?: { selected: boolean; onToggle: () => void }
  /** The group the row is listed under, whose heading its line needn't repeat. */
  group?: SpaceGroup
}

/** One task in a space: where it stands, whose turn it is, who owns it, and its last word. */
export function SpaceTaskRow({ task, space, selection, group }: SpaceTaskRowProps) {
  const href = taskPath(space, task)
  const situation = task.situation
  const asked = situation?.yourMove && situation.state === 'question'
  return (
    <ListRow
      label={task.title}
      leading={
        selection && (
          <span className="relative z-10 flex">
            <Checkbox checked={selection.selected} onChange={selection.onToggle} aria-label={`Select ${task.key}`} />
          </span>
        )
      }
      taskKey={task.key}
      title={task.title}
      href={href}
      titleExtra={
        (task.unread ?? 0) > 0 && (
          <Badge aria-label={`${task.unread} new message${task.unread === 1 ? '' : 's'}`}>{task.unread} unread</Badge>
        )
      }
      meta={
        <MetaLine
          parts={[
            asked ? 'Agent asked you' : statusUnder(situation?.label, group),
            situation && turnLine(situation),
            task.owner && `Owned by ${task.owner.name.split(' ')[0]}`,
            quotedLastMessage(task.lastMessage),
          ]}
        />
      }
      action={
        asked && (
          <Button href={href} color="brand">
            Answer
          </Button>
        )
      }
    />
  )
}
