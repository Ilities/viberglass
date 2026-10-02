import type { JobFailureCategory } from './job'
import type { TicketLifecycleStatus } from './ticket'
import type { TaskTurnAction } from './taskTurn'

/** Where a task stands, in the only words the product uses for it. */
export const TASK_SITUATION_STATES = [
  'not_started',
  'agent_working',
  'paused',
  'question',
  'artifact_ready',
  'discussing',
  'failed',
  'pr_open',
  'done',
] as const

export type TaskSituationState = (typeof TASK_SITUATION_STATES)[number]

export interface TaskPerson {
  id: string
  name: string
}

export type TaskWaitingOn = { kind: 'people'; people: TaskPerson[] } | { kind: 'agent' } | { kind: 'nobody' }

export interface TaskSituation {
  state: TaskSituationState
  /** "Plan v2 ready", "Agent revising the plan", "Question for Maria". */
  label: string
  waitingOn: TaskWaitingOn
  /** When the task got into this state. */
  since: string
  /** Whether it's the move of the person who asked. */
  yourMove: boolean
}

export type TaskSituationArtifact = 'research' | 'plan' | 'code'

/** What a task's situation is worked out from; the server gathers it per task. */
export interface TaskSituationInput {
  status: TicketLifecycleStatus
  createdAt: string
  /** Who drives the task when nobody else is asked: its owner, else its requester. */
  owner: TaskPerson | null
  /** The newest artifact version; code is the pull request. */
  latestArtifact: { kind: TaskSituationArtifact; version: number; at: string } | null
  /** The agent's turn running now. */
  runningTurn: { action: TaskTurnAction; since: string } | null
  /** Since when someone has had the agent paused; asks wait until it's resumed. */
  pausedSince?: string | null
  /** Who took the work over from the agent, while they have it. */
  takenOver?: { by: TaskPerson; at: string } | null
  /** The agent's latest finished turn. */
  lastTurn: { status: 'completed' | 'failed' | 'cancelled'; at: string; failure: { title?: string; category?: JobFailureCategory } | null } | null
  /** A question from the agent nobody has answered. */
  openQuestion: { askedOf: TaskPerson[]; since: string } | null
  /** Mentions, by people or by the agent with an artifact, that the person hasn't answered by posting. */
  openMentions: Array<{ person: TaskPerson; at: string }>
  /** When someone last wrote in the thread. */
  lastMessageAt: string | null
  /** Who merged the pull request that finished the task, when GitHub said. */
  mergedBy?: string | null
}

export interface SituationViewer {
  id: string
  isAdmin: boolean
}

const ARTIFACT_NAME: Record<TaskSituationArtifact, string> = { research: 'Research', plan: 'Plan', code: 'Code' }

const WORKING: Record<TaskTurnAction, string> = {
  research: 'writing the research',
  plan: 'writing the plan',
  code: 'building',
  reply: 'replying',
  summarise: 'summarising',
}

const REVISING: Partial<Record<TaskTurnAction, string>> = { research: 'revising the research', plan: 'revising the plan', code: 'updating the code' }

const ARTIFACT_OF_ACTION: Partial<Record<TaskTurnAction, TaskSituationArtifact>> = { research: 'research', plan: 'plan', code: 'code' }

const later = (a: string | null | undefined, b: string | null | undefined) => (!a ? false : !b ? true : a > b)

function names(people: TaskPerson[]): string {
  const list = people.map((person) => person.name)
  return list.length <= 1 ? (list[0] ?? '') : `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`
}

/** Mentioned people who haven't answered, once each, else the owner. */
function mentionedElseOwner(input: TaskSituationInput, after?: string): TaskWaitingOn {
  const seen = new Set<string>()
  const people = input.openMentions
    .filter((mention) => !after || mention.at >= after)
    .flatMap(({ person }) => (seen.has(person.id) ? [] : (seen.add(person.id), [person])))
  if (people.length > 0) return { kind: 'people', people }
  return input.owner ? { kind: 'people', people: [input.owner] } : { kind: 'nobody' }
}

const ownerOnly = (input: TaskSituationInput): TaskWaitingOn =>
  input.owner ? { kind: 'people', people: [input.owner] } : { kind: 'nobody' }

/**
 * Where a task stands and whose move it is, the same on Home,
 * the space page and the task page. In order: done, the agent working, the
 * agent paused, a question, a failure nothing has happened since, people talking since the
 * latest artifact, the pull request, the latest artifact, else not started.
 */
export function taskSituation(input: TaskSituationInput, viewer: SituationViewer): TaskSituation {
  const situation = decide(input)
  const failedOnSetup = input.lastTurn?.status === 'failed' && (input.lastTurn.failure?.category === 'setup' || input.lastTurn.failure?.category === 'platform')
  const setupFailure = (situation.state === 'failed' || situation.state === 'paused') && failedOnSetup
  const yourMove =
    (situation.waitingOn.kind === 'people' && situation.waitingOn.people.some((person) => person.id === viewer.id)) ||
    (setupFailure && viewer.isAdmin)
  return { ...situation, yourMove }
}

function decide(input: TaskSituationInput): Omit<TaskSituation, 'yourMove'> {
  if (input.status === 'resolved') {
    const label = input.mergedBy ? `Done · merged by ${input.mergedBy}` : 'Done'
    return { state: 'done', label, waitingOn: { kind: 'nobody' }, since: input.lastTurn?.at ?? input.createdAt }
  }

  const artifact = input.latestArtifact
  if (input.runningTurn) {
    const { action, since } = input.runningTurn
    const revising = artifact && ARTIFACT_OF_ACTION[action] === artifact.kind ? REVISING[action] : undefined
    return { state: 'agent_working', label: `Agent ${revising ?? WORKING[action]}`, waitingOn: { kind: 'agent' }, since }
  }

  if (input.takenOver) {
    const { by, at } = input.takenOver
    return { state: 'paused', label: 'Taken over locally', waitingOn: { kind: 'people', people: [by] }, since: at }
  }
  if (input.pausedSince) {
    // A setup failure pauses the agent until someone fixes it and tries again.
    const failure = input.lastTurn?.status === 'failed' && input.lastTurn.failure?.category === 'setup' ? input.lastTurn.failure.title : undefined
    return { state: 'paused', label: failure ? `Paused · ${failure}` : 'Agent paused', waitingOn: ownerOnly(input), since: input.pausedSince }
  }

  if (input.openQuestion) {
    const { askedOf, since } = input.openQuestion
    const waitingOn: TaskWaitingOn = askedOf.length > 0 ? { kind: 'people', people: askedOf } : ownerOnly(input)
    const label = waitingOn.kind === 'people' ? `Question for ${names(waitingOn.people)}` : 'Question'
    return { state: 'question', label, waitingOn, since }
  }

  const last = input.lastTurn
  if (last?.status === 'failed' && !later(artifact?.at, last.at) && !later(input.lastMessageAt, last.at)) {
    const title = last.failure?.title
    return { state: 'failed', label: title ? `Failed · ${title}` : 'Failed', waitingOn: ownerOnly(input), since: last.at }
  }

  if (input.lastMessageAt && (!artifact || input.lastMessageAt > artifact.at)) {
    return { state: 'discussing', label: 'Discussing', waitingOn: mentionedElseOwner(input), since: input.lastMessageAt }
  }

  if (artifact?.kind === 'code') return { state: 'pr_open', label: 'PR open', waitingOn: ownerOnly(input), since: artifact.at }
  if (artifact) {
    return {
      state: 'artifact_ready',
      label: `${ARTIFACT_NAME[artifact.kind]} v${artifact.version} ready`,
      waitingOn: mentionedElseOwner(input, artifact.at),
      since: artifact.at,
    }
  }

  return { state: 'not_started', label: 'Not started', waitingOn: ownerOnly(input), since: input.createdAt }
}

/** "Plan v2 ready · Tomi": the state, and whose move when it's someone's. */
export function situationPhrase(situation: TaskSituation): string {
  if (situation.waitingOn.kind !== 'people' || situation.state === 'question') return situation.label
  return `${situation.label} · ${names(situation.waitingOn.people)}`
}
