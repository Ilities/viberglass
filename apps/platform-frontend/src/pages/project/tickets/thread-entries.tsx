import { Button } from '@/components/button'
import { Timestamp } from '@/components/timestamp'
import type { TaskArtifactKind, TaskTimelineEntry } from '@viberglass/types'
import { describeActivity } from './activity-sentence'
import { MessageBody } from './message-body'
import { ThreadItem } from './thread-item'

const ARTIFACT_NAME: Record<TaskArtifactKind, string> = { plan: 'Plan' }

/** What someone wrote in the thread, or to the agent in its session. */
export function MessageEntry({ entry }: { entry: Extract<TaskTimelineEntry, { kind: 'message' }> }) {
  return (
    <ThreadItem
      who={entry.author?.name ?? 'Someone'}
      at={entry.at}
      note={entry.channel === 'session' ? 'to the agent' : undefined}
    >
      <MessageBody body={entry.body} />
    </ThreadItem>
  )
}

/** A new version of a document, as a card that opens it. */
export function VersionEntry({
  entry,
  onOpen,
}: {
  entry: Extract<TaskTimelineEntry, { kind: 'artifact_version' }>
  onOpen: () => void
}) {
  const who = entry.byAgent ? 'Written by the agent' : `Edited by ${entry.author?.name ?? 'someone'}`
  return (
    <li className="ml-[42px] flex items-center justify-between gap-3 rounded-[7px] border border-[var(--gray-5)] bg-[var(--gray-2)] px-4 py-3">
      <div>
        <p className="text-sm font-semibold text-[var(--gray-12)]">
          {ARTIFACT_NAME[entry.artifact]} v{entry.version}
        </p>
        <p className="text-xs text-[var(--gray-10)]">
          {who} · <Timestamp date={entry.at} />
        </p>
      </div>
      <Button outline onClick={onOpen} aria-label={`Open ${ARTIFACT_NAME[entry.artifact]} v${entry.version}`}>
        Open
      </Button>
    </li>
  )
}

/** Something that happened on the task, in a quiet line: someone started watching, a run was cancelled. */
export function EventEntry({
  entry,
  nameOf,
}: {
  entry: Extract<TaskTimelineEntry, { kind: 'event' }>
  nameOf: (id: string) => string
}) {
  return (
    <li className="-mt-3 ml-[42px] flex items-baseline justify-between gap-4 text-xs text-[var(--gray-10)]">
      <span>{describeActivity(entry.activity, nameOf)}</span>
      <Timestamp date={entry.at} className="shrink-0" />
    </li>
  )
}
