import { MarkMentionDone } from '@/components/mark-mention-done'
import { useAuth } from '@/context/auth-context'
import { usePersonName } from '@/hooks/usePeople'
import { getTaskTimeline } from '@/service/api/discussion-api'
import { markTaskRead } from '@/service/api/home-api'
import type { JobListItem } from '@/service/api/job-api'
import type { Clanker, TaskArtifactKind, TaskTimelineEntry } from '@viberglass/types'
import { useCallback, useEffect, useState } from 'react'
import { AgentSteering } from './agent-steering'
import { AgentTurnEntry } from './agent-turn-entry'
import { BringInAgent, type BringableAgent } from './bring-in-agent'
import { CommentEntry, commentStatuses, isFullComment } from './comment-entry'
import { NextAgentLine } from './next-agent-line'
import { OpenQuestions, QuestionEntry } from './question-entry'
import { PinnedSummary, SummaryEntry } from './summary-entry'
import { TaskComposer, type Mentionable } from './task-composer'
import { RetryTurnButton, TaskSuggestedActions } from './task-suggested-actions'
import { retrySuggestion, suggestTaskActions, type TaskSuggestionInput } from './task-suggestions'
import { EventEntry, FoldedAttempts, MessageEntry, VersionEntry } from './thread-entries'
import { attemptsLabel, foldAttempts } from './thread-folds'
import { summaryFacts } from './thread-summaries'

interface TaskThreadProps {
  taskId: string
  /** Changes whenever the task's runs, sessions or documents do, so the thread follows them. */
  refreshKey: string
  /** Opens the plan at a version; null opens its current version, where people comment and edit. */
  onOpenArtifact: (version: number | null) => void
  /** Opens the plan's comments. */
  onOpenComments?: () => void
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
  /** Every runner, to describe the one the next ask goes to. */
  clankers?: Clanker[]
  /** The page reloads after an ask, to show the agent working. */
  onAsked: () => void
  /** Run status and duration shown beneath the turn that started it. */
  runs?: JobListItem[]
}

/** The task's one thread: what people and the agent said and asked, each document version, and what happened, in order. */
export function TaskThread({
  taskId,
  refreshKey,
  onOpenArtifact,
  onOpenComments = () => undefined,
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
  clankers = [],
  onAsked,
  runs = [],
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
  const seen = entries
    ? entries.map((entry) => (entry.kind === 'agent_turn' ? `${entry.id}:${entry.status}` : entry.id)).join(',')
    : null
  useEffect(() => {
    if (seen === null || !canPost) return
    markTaskRead(taskId).catch(() => undefined)
  }, [seen, canPost, taskId])

  if (!entries) return null
  // A comment is a message about a document; a change to its status shows on the comment itself.
  const listed = entries.filter(
    (entry) =>
      !(
        entry.kind === 'event' &&
        entry.activity.kind === 'comment_status_changed'
      )
  )
  const shown = messagesOnly ? listed.filter((entry) => entry.kind !== 'event' || isFullComment(entry)) : listed
  const statuses = commentStatuses(entries)
  const nameOf = (id: string) => personName(id) ?? 'someone'
  const latestTurn =
    entries.findLast(
      (entry): entry is Extract<TaskTimelineEntry, { kind: 'agent_turn' }> => entry.kind === 'agent_turn'
    ) ?? null
  const agentWorking =
    suggestionInput.agentWorking || latestTurn?.status === 'queued' || latestTurn?.status === 'running'
  const summaries = summaryFacts(entries)
  const retry = retrySuggestion({ ...suggestionInput, agentWorking, latestTurn })
  const suggestions = suggestTaskActions({
    ...suggestionInput,
    agentWorking,
    latestTurn,
    sinceSummary: summaries.sinceLatest,
  })
  const onTask = new Set(entries.flatMap((entry) => (entry.kind === 'agent_turn' ? [entry.agent.id] : [])))
  const bringable = runnableAgents.filter((agent) => !onTask.has(agent.id))
  const latestVersion = new Map<TaskArtifactKind, number>()
  for (const entry of entries)
    if (entry.kind === 'artifact_version')
      latestVersion.set(entry.artifact, Math.max(entry.version, latestVersion.get(entry.artifact) ?? 0))
  const posted = () => {
    load()
    onAsked()
  }

  const renderEntry = (entry: TaskTimelineEntry) =>
    entry.kind === 'message' ? (
      <MessageEntry key={entry.id} entry={entry} />
    ) : entry.kind === 'agent_turn' ? (
      <AgentTurnEntry
        key={entry.id}
        entry={entry}
        run={runs.find((run) => run.jobId === entry.jobId)}
        summaryVersion={summaries.versionByTurn.get(entry.id)}
        retry={retry && entry.id === latestTurn?.id && <RetryTurnButton taskId={taskId} suggestion={retry} onAsked={posted} />}
      />
    ) : entry.kind === 'question' ? (
      <QuestionEntry key={entry.id} entry={entry} answerBelow={canPost} />
    ) : entry.kind === 'summary' ? (
      <SummaryEntry key={entry.id} entry={entry} />
    ) : entry.kind === 'artifact_version' ? (
      <VersionEntry
        key={entry.id}
        entry={entry}
        onOpen={() => onOpenArtifact(entry.version === latestVersion.get(entry.artifact) ? null : entry.version)}
      />
    ) : entry.kind === 'event' && isFullComment(entry) ? (
      <CommentEntry
        key={entry.id}
        entry={entry}
        status={statuses.get(String(entry.activity.payload.commentId)) ?? 'open'}
        onOpenComments={onOpenComments}
      />
    ) : (
      <EventEntry key={entry.id} entry={entry} nameOf={nameOf} />
    )

  return (
    <section
      aria-label="Conversation"
      className="space-y-5 rounded-[9px] border border-[var(--gray-5)] bg-[var(--color-panel-solid)] p-6 max-sm:px-4"
    >
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-base font-semibold text-[var(--gray-12)]">Conversation</h2>
        <label className="flex items-center gap-2 text-xs text-[var(--gray-11)]">
          <input type="checkbox" checked={messagesOnly} onChange={(event) => setMessagesOnly(event.target.checked)} />
          Messages only
        </label>
      </div>

      {summaries.latest && <PinnedSummary entry={summaries.latest} />}

      {shown.length === 0 ? (
        <p className="text-sm text-[var(--gray-10)]">
          {canAsk
            ? 'Nothing here yet. Ask the agent, or bring someone in with @.'
            : canPost
              ? 'Nothing here yet. Write below, or bring someone in with @.'
              : 'Nothing here yet. What people and the agent say shows up here.'}
        </p>
      ) : (
        <ol className="space-y-6">
          {foldAttempts(shown, retry && latestTurn ? latestTurn.id : null).map((row) =>
            row.kind === 'entry' ? (
              renderEntry(row.entry)
            ) : (
              <FoldedAttempts key={row.id} label={attemptsLabel(row.turns)} latestAt={row.turns[row.turns.length - 1].at}>
                {row.entries.map(renderEntry)}
              </FoldedAttempts>
            )
          )}
        </ol>
      )}

      {notice}
      <AgentSteering
        taskId={taskId}
        refreshKey={refreshKey}
        agentWorking={agentWorking}
        paused={paused}
        agentName={(id) => clankers.find((clanker) => clanker.id === id)?.name ?? null}
        pausedForSetup={pausedForSetup}
        canSteer={canSteer}
        onChanged={posted}
      />
      {canPost && <OpenQuestions taskId={taskId} entries={entries} viewerId={user?.id} onAnswered={posted} />}
      {canAsk && !agentWorking && (
        <NextAgentLine taskId={taskId} refreshKey={refreshKey} clankers={clankers} agentsOnTask={onTask} />
      )}
      {canPost && mentionsYou && (
        <div className="flex items-center justify-between gap-4 text-sm text-[var(--gray-11)]">
          <p>You were mentioned here.</p>
          <MarkMentionDone taskId={taskId} onDone={onAsked} />
        </div>
      )}
      {canPost && (
        <TaskComposer
          taskId={taskId}
          agents={canAsk ? agents : []}
          agentWorking={agentWorking}
          canInterrupt={canSteer}
          onPosted={posted}
        />
      )}
      {canAsk && (
        <TaskSuggestedActions
          taskId={taskId}
          suggestions={suggestions}
          agentWorking={agentWorking}
          onAsked={posted}
          trailing={bringable.length > 0 && <BringInAgent taskId={taskId} agents={bringable} onAsked={posted} />}
        />
      )}
    </section>
  )
}
