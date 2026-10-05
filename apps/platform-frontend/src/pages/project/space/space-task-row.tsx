import { Badge } from '@/components/badge'
import { Button } from '@/components/button'
import { Checkbox } from '@/components/checkbox'
import { ListRow, MetaLine } from '@/components/list-panel'
import { taskPath } from '@/lib/taskPath'
import { quotedLastMessage, turnLine } from '@/pages/home/home-threads'
import type { Ticket } from '@viberglass/types'

interface SpaceTaskRowProps {
  task: Ticket
  space: string
  /** Set only for people who may archive, who get a checkbox. */
  selection?: { selected: boolean; onToggle: () => void }
}

/** The row's one action: answer the agent, follow its work, or open the task. */
function actionFor(task: Ticket, href: string): React.ReactNode {
  const situation = task.situation
  if (situation?.yourMove && situation.state === 'question') {
    return (
      <Button href={href} color="brand">
        Answer
      </Button>
    )
  }
  return (
    <Button href={href} outline>
      {situation?.state === 'agent_working' ? 'Open thread' : 'Open'}
    </Button>
  )
}

/** One task in a space: where it stands, whose turn it is, who owns it, and its last word. */
export function SpaceTaskRow({ task, space, selection }: SpaceTaskRowProps) {
  const href = taskPath(space, task)
  const situation = task.situation
  return (
    <ListRow
      label={task.title}
      leading={
        selection && (
          <Checkbox checked={selection.selected} onChange={selection.onToggle} aria-label={`Select ${task.key}`} />
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
            situation?.yourMove && situation.state === 'question' ? 'Agent asked you' : situation?.label,
            situation && turnLine(situation),
            task.owner && `Owned by ${task.owner.name.split(' ')[0]}`,
            quotedLastMessage(task.lastMessage),
          ]}
        />
      }
      action={actionFor(task, href)}
    />
  )
}
