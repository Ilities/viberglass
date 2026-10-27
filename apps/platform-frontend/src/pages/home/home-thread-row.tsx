import { Badge } from '@/components/badge'
import { Button } from '@/components/button'
import { Link } from '@/components/link'
import { ListRow, MetaLine } from '@/components/list-panel'
import { MarkMentionDone } from '@/components/mark-mention-done'
import { Timestamp } from '@/components/timestamp'
import { taskPath } from '@/lib/taskPath'
import type { HomeThread } from '@viberglass/types'
import { agentNeedsYou, needsYouReason, quotedLastMessage, turnLine } from './home-threads'
import { AttentionControls } from './attention-controls'

/**
 * A thread that needs you: who's asking, why, and what they said. A question
 * gets an Answer button; a mention you needn't answer can be acknowledged here.
 */
export function NeedsYouRow({ thread, onChanged }: { thread: HomeThread; onChanged: () => void }) {
  const href = taskPath(thread.task.spaceSlug, thread.task)
  const asked = thread.attention?.kind ? thread.attention.kind === 'question' : thread.situation.state === 'question'
  const fromAgent = agentNeedsYou(thread)
  const review = thread.attention?.kind === 'mention' && fromAgent
  const failed = thread.attention?.kind === 'failure'
  const deferred = thread.attention?.status === 'waiting' || thread.attention?.status === 'later'
  return (
    <li aria-label={thread.task.title} className="rounded-xl border border-[var(--gray-5)] bg-[var(--color-panel-solid)] p-5">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--gray-10)]">
        <span>{deferred ? thread.attention?.status === 'waiting' ? 'Waiting' : 'Reminder set' : needsYouReason(thread)}</span>
        <Timestamp date={thread.latestActivityAt} />
      </div>
      <p className="mt-3 text-base font-semibold"><Link href={href} className="hover:underline">{thread.task.title}</Link></p>
      <p className="mt-1 text-xs text-[var(--gray-10)]">{thread.task.key} · {thread.task.spaceName}</p>
      <p className="mt-3 text-sm text-[var(--gray-11)]">{deferred && thread.attention?.reason ? thread.attention.reason : asked && thread.questionText ? thread.questionText : thread.mentionsYou && !fromAgent ? quotedLastMessage(thread.lastMessage) : thread.situation.label}</p>
      {deferred && thread.attention?.remindAt && <p className="mt-2 text-xs text-[var(--gray-10)]">Reminder: {new Date(thread.attention.remindAt).toLocaleString()}</p>}
      {!deferred && (asked || review || failed || (thread.mentionsYou && !thread.attention)) && <div className="mt-4">{asked ? <Button href={href} color="brand">Answer</Button> : review ? <Button href={href} color="brand">Review</Button> : failed ? <Button href={href} color="brand">Inspect issue</Button> : <MarkMentionDone taskId={thread.task.id} onDone={onChanged} />}</div>}
      <AttentionControls thread={thread} onChanged={onChanged} review={review} />
    </li>
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
