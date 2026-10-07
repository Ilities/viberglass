import { Avatar } from '@/components/avatar'
import { Badge } from '@/components/badge'
import { Button } from '@/components/button'
import { ListRow, MetaLine } from '@/components/list-panel'
import { MarkMentionDone } from '@/components/mark-mention-done'
import { Timestamp } from '@/components/timestamp'
import { initialsOf } from '@/lib/initials'
import { taskPath } from '@/lib/taskPath'
import type { HomeThread } from '@viberglass/types'
import { needsYouReason, quotedLastMessage, turnLine } from './home-threads'

/**
 * A thread that needs you: who's asking, why, and what they said. A question
 * gets an Answer button; a mention you needn't answer can be acknowledged here.
 */
export function NeedsYouRow({ thread, onChanged }: { thread: HomeThread; onChanged: () => void }) {
  const href = taskPath(thread.task.spaceSlug, thread.task)
  const asked = thread.situation.state === 'question'
  const from = asked ? 'AI' : thread.lastMessage?.author ? initialsOf(thread.lastMessage.author.name) : '?'
  return (
    <ListRow
      label={thread.task.title}
      leading={<Avatar initials={from} size="2" />}
      badge={<Badge color="amber">{needsYouReason(thread)}</Badge>}
      taskKey={thread.task.key}
      title={thread.task.title}
      href={href}
      meta={
        <MetaLine
          parts={[
            thread.mentionsYou && !asked ? quotedLastMessage(thread.lastMessage) : thread.situation.label,
            thread.task.spaceName,
            <Timestamp key="at" date={thread.latestActivityAt} />,
          ]}
        />
      }
      action={
        asked ? (
          <Button href={href} color="brand">
            Answer
          </Button>
        ) : (
          thread.mentionsYou && <MarkMentionDone taskId={thread.task.id} onDone={onChanged} />
        )
      }
    />
  )
}

/** One of your threads: where it stands, whose turn it is, its last word, and how much is new. */
export function ConversationRow({ thread }: { thread: HomeThread }) {
  return (
    <ListRow
      label={thread.task.title}
      taskKey={thread.task.key}
      title={thread.task.title}
      href={taskPath(thread.task.spaceSlug, thread.task)}
      titleExtra={
        thread.unread > 0 && (
          <Badge aria-label={`${thread.unread} new message${thread.unread === 1 ? '' : 's'}`}>
            {thread.unread} unread
          </Badge>
        )
      }
      meta={
        <MetaLine
          parts={[
            thread.situation.label,
            turnLine(thread.situation),
            quotedLastMessage(thread.lastMessage) ?? <Timestamp key="at" date={thread.latestActivityAt} />,
            thread.task.spaceName,
          ]}
        />
      }
    />
  )
}
