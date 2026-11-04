import { buildPartsMessage, nextBuild, type PartRange, type TaskPlanParts } from './planParts'
import type { SpaceBackingKind } from './spaceBacking'
import type { TaskTurnAction } from './taskTurn'

/** Work to offer as a task's next step. A build and an artifact are both asked for as code. */
export interface WorkOffer {
  action: 'code'
  label: string
  /** For a build: the plan's parts it builds, in a pull request of its own. */
  parts?: PartRange
}

/** What the web and chat offer to whoever may ask for code: a Files task's artifact, else builds of the plan. */
export function nextWork(backing: SpaceBackingKind, task: { planParts: TaskPlanParts | null; hasArtifacts: boolean }): WorkOffer[] {
  if (backing === 'files') return [artifactWork(task.hasArtifacts)]
  const builds = buildWork(task.planParts)
  // An App space's people ask for a change to their app; a build of some parts keeps its name.
  return backing === 'app' ? builds.map((offer) => (offer.parts ? offer : { ...offer, label: 'Make the change' })) : builds
}

/** In a Files space, the build makes or revises the task's artifact. */
export function artifactWork(hasArtifacts: boolean): WorkOffer {
  return { action: 'code', label: hasArtifacts ? 'Revise artifact' : 'Create artifact' }
}

/**
 * The builds to offer: a plan in parts builds its next part, or everything
 * left in one pull request, once the earlier parts are merged; a plan in one
 * part, or none, is built as a whole.
 */
export function buildWork(planParts: TaskPlanParts | null): WorkOffer[] {
  const next = planParts ? nextBuild(planParts) : { label: 'Build it' }
  if (!next) return []
  const offered: WorkOffer[] = [{ action: 'code', label: next.label, ...(next.parts ? { parts: next.parts } : {}) }]
  const left = planParts?.parts.filter((part) => part.status === 'not_built') ?? []
  // A build offered again keeps its parts; the rest go with it only once nothing is open.
  if (next.parts && !planParts?.open && left.length > 1) {
    const rest = { first: next.parts.first, last: null }
    offered.push({ action: 'code', label: buildPartsMessage(rest), parts: rest })
  }
  return offered
}

/** A turn's run, for saying it started ("building") or failed ("the build run"). */
export interface TurnRunLabel {
  doing: string
  run: string
}

const RUN_LABEL: Record<TaskTurnAction, TurnRunLabel> = {
  plan: { doing: 'writing the plan', run: 'plan' },
  code: { doing: 'building', run: 'build' },
  reply: { doing: 'replying', run: 'reply' },
  summarise: { doing: 'summarising', run: 'summary' },
}

/** A Files space's code turn makes its artifact rather than a build, and an App space's makes a change to its app. */
export function turnRunLabel(action: TaskTurnAction, backing: SpaceBackingKind): TurnRunLabel {
  if (backing === 'files' && action === 'code') return { doing: 'working on the artifact', run: 'artifact' }
  if (backing === 'app' && action === 'code') return { doing: 'making the change', run: 'change' }
  return RUN_LABEL[action]
}
