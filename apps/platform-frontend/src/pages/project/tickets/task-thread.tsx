import { Button } from '@/components/button'
import { Timestamp } from '@/components/timestamp'
import { useAuth } from '@/context/auth-context'
import { usePersonName } from '@/hooks/usePeople'
import { getTaskTimeline } from '@/service/api/discussion-api'
import { markTaskRead } from '@/service/api/home-api'
import type { TaskArtifactKind, TaskTimelineEntry } from '@viberglass/types'
import { useCallback, useEffect, useState } from 'react'
import { describeActivity } from './activity-sentence'
import { AgentSteering } from './agent-steering'
import { AgentTurnEntry } from './agent-turn-entry'
import { BringInAgent, type BringableAgent } from './bring-in-agent'
import { MarkMentionDone } from '@/components/mark-mention-done'
import { MessageBody } from './message-body'
import { OpenQuestions, QuestionEntry } from './question-entry'
import { TaskComposer, type Mentionable } from './task-composer'
import { TaskSuggestedActions } from './task-suggested-actions'
import { suggestTaskActions, type TaskSuggestionInput } from './task-suggestions'
import { summaryFacts } from './thread-summaries'
import { PinnedSummary, SummaryEntry } from './summary-entry'

const ARTIFACT_NAME: Record<TaskArtifactKind, string> = { research: 'Research', plan: 'Plan' }
const ARTIFACT_STEP: Record<TaskArtifactKind, 'research' | 'planning'> = { research: 'research', plan: 'planning' }

interface TaskThreadProps {
  taskId: string
  /** The task's key (WEB-42), for the command that checks its branch out. */
  taskKey?: string
  /** The space's slug, for links to the agent's runs. */
  project: string
  /** Changes whenever the task's runs, sessions or documents do, so the thread follows them. */
  refreshKey: string
  onOpenArtifact: (step: 'research' | 'planning') => void
  /** The agents a message can ask, the one already on the task first. */
  agents: Mentionable[]
  /** What the suggested actions are worked out from; the latest turn comes from the thread. */
  suggestionInput: Omit<TaskSuggestionInput, 'latestTurn'>
  /** Whether the person may post and ask the agent, from the task's capabilities. Viewers do neither. */
  canPost: boolean
  canAsk: boolean
  /** Whether the person may interrupt, pause and resume the agent. */
  canSteer?: boolean
  /** Whether someone has the agent paused. */
  paused?: boolean
  /** Whether a setup failure paused it. */
  pausedForSetup?: boolean
  /** Whether someone mentioned the person here and they haven't replied or marked it done. */
  mentionsYou?: boolean
  /** What needs dealing with before anything else, such as why the agent's last run failed. Shown above the composer. */
  notice?: React.ReactNode
  /** Agents that can run, any of which can be brought in when it isn't on the task yet. */
  runnableAgents: BringableAgent[]
  /** The page reloads after an ask, to show the agent working. */
  onAsked: () => void
}

function MessageEntry({ entry }: { entry: Extract<TaskTimelineEntry, { kind: 'message' }> }) {
  return (
    <li>
      <p className="text-xs text-[var(--gray-10)]">
        <span className="font-medium text-[var(--gray-11)]">{entry.author?.name ?? 'Someone'}</span>
        {entry.channel === 'session' && ' to the agent'}{' '}
        · <Timestamp date={entry.at} />
      </p>
      <MessageBody body={entry.body} />
    </li>
  )
}

function VersionEntry({ entry, onOpen }: { entry: Extract<TaskTimelineEntry, { kind: 'artifact_version' }>; onOpen: () => void }) {
  const who = entry.byAgent ? 'Written by the agent' : `Edited by ${entry.author?.name ?? 'someone'}`
  return (
    <li className="flex items-center justify-between gap-4 rounded-lg border border-[var(--gray-6)] bg-[var(--gray-2)] px-4 py-3">
      <div>
        <p className="text-sm font-medium text-[var(--gray-12)]">
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

function EventEntry({ entry, nameOf }: { entry: Extract<TaskTimelineEntry, { kind: 'event' }>; nameOf: (id: string) => string }) {
  return (
    <li className="flex items-baseline justify-between gap-4 text-xs text-[var(--gray-10)]">
      <span>{describeActivity(entry.activity, nameOf)}</span>
      <Timestamp date={entry.at} className="shrink-0" />
    </li>
  )
}

/** The task's one thread: what people and the agent said and asked, each document version, and what happened, in order. */
export function TaskThread({
  taskId,
  taskKey = '',
  project,
  refreshKey,
  onOpenArtifact,
  agents,
  suggestionInput,
  canPost,
  canAsk,
  canSteer = false,
  paused = false,
  pausedForSetup = false,
  mentionsYou = false,
  notice,
  runnableAgents,
  onAsked,
}: TaskThreadProps) {
  const { user } = useAuth()
  const personName = usePersonName()
  const [entries, setEntries] = useState<TaskTimelineEntry[] | null>(null)
  const [messagesOnly, setMessagesOnly] = useState(false)

  const load = useCallback(() => {
    getTaskTimeline(taskId)
      .then(setEntries)
      .catch(() => setEntries((current) => current ?? []))
  }, [taskId])

  useEffect(() => load(), [load, refreshKey])

  // Seeing the thread reads it, again whenever something new shows up while it's open. Viewers are read-only on the server.
  const seen = entries ? entries.map((entry) => (entry.kind === 'agent_turn' ? `${entry.id}:${entry.status}` : entry.id)).join(',') : null
  useEffect(() => {
    if (seen === null || !canPost) return
    markTaskRead(taskId).catch(() => undefined)
  }, [seen, canPost, taskId])

  if (!entries) return null
  const shown = messagesOnly ? entries.filter((entry) => entry.kind !== 'event') : entries
  const nameOf = (id: string) => personName(id) ?? 'someone'
  const latestTurn = entries.findLast((entry): entry is Extract<TaskTimelineEntry, { kind: 'agent_turn' }> => entry.kind === 'agent_turn') ?? null
  const agentWorking = suggestionInput.agentWorking || latestTurn?.status === 'queued' || latestTurn?.status === 'running'
  const summaries = summaryFacts(entries)
  const suggestions = suggestTaskActions({ ...suggestionInput, agentWorking, latestTurn, sinceSummary: summaries.sinceLatest })
  const onTask = new Set(entries.flatMap((entry) => (entry.kind === 'agent_turn' ? [entry.agent.id] : [])))
  const bringable = runnableAgents.filter((agent) => !onTask.has(agent.id))
  const posted = () => {
    load()
    onAsked()
  }

  return (
    <section aria-label="Thread" className="space-y-5">
      <div className="flex items-center justify-between gap-4 border-b border-[var(--gray-6)] pb-2">
        <h2 className="text-sm font-semibold text-[var(--gray-12)]">Thread</h2>
        <label className="flex items-center gap-2 text-xs text-[var(--gray-11)]">
          <input type="checkbox" checked={messagesOnly} onChange={(event) => setMessagesOnly(event.target.checked)} />
          Messages only
        </label>
      </div>

      {summaries.latest && <PinnedSummary entry={summaries.latest} />}

      {shown.length === 0 ? (
        <p className="text-sm text-[var(--gray-10)]">Nothing here yet. Ask the agent, or bring someone in with @.</p>
      ) : (
        <ol className="space-y-4">
          {shown.map((entry) =>
            entry.kind === 'message' ? (
              <MessageEntry key={entry.id} entry={entry} />
            ) : entry.kind === 'agent_turn' ? (
              <AgentTurnEntry key={entry.id} entry={entry} project={project} summaryVersion={summaries.versionByTurn.get(entry.id)} />
            ) : entry.kind === 'question' ? (
              <QuestionEntry key={entry.id} entry={entry} />
            ) : entry.kind === 'summary' ? (
              <SummaryEntry key={entry.id} entry={entry} />
            ) : entry.kind === 'artifact_version' ? (
              <VersionEntry key={entry.id} entry={entry} onOpen={() => onOpenArtifact(ARTIFACT_STEP[entry.artifact])} />
            ) : (
              <EventEntry key={entry.id} entry={entry} nameOf={nameOf} />
            )
          )}
        </ol>
      )}

      {notice}
      <AgentSteering
        taskId={taskId}
        taskKey={taskKey}
        refreshKey={refreshKey}
        agentWorking={agentWorking}
        paused={paused}
        pausedForSetup={pausedForSetup}
        canSteer={canSteer}
        onChanged={posted}
      />
      {canPost && <OpenQuestions taskId={taskId} entries={entries} viewerId={user?.id} onAnswered={posted} />}
      {canAsk && <TaskSuggestedActions taskId={taskId} suggestions={suggestions} agentWorking={agentWorking} onAsked={posted} />}
      {canPost && mentionsYou && (
        <div className="flex items-center justify-between gap-4 text-sm text-[var(--gray-11)]">
          <p>You were mentioned here. Reply below, or mark it done if there&apos;s nothing to say.</p>
          <MarkMentionDone taskId={taskId} onDone={onAsked} />
        </div>
      )}
      {canPost && (
        <TaskComposer taskId={taskId} agents={canAsk ? agents : []} canInterrupt={canSteer && agentWorking} onPosted={posted} />
      )}
      {canAsk && !agentWorking && <BringInAgent taskId={taskId} agents={bringable} onAsked={posted} />}
    </section>
  )
}
