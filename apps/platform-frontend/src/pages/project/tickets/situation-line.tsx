import { situationPhrase, type TaskSituation } from '@viberglass/types'

/** "Your move · Plan v2 ready · Tomi": where the task stands, the same words as on Home. */
export function SituationLine({ situation, className = '' }: { situation: TaskSituation; className?: string }) {
  return (
    <p className={`text-sm text-[var(--gray-11)] ${className}`} aria-label="Situation">
      {situation.yourMove && <span className="font-semibold text-[var(--accent-11)]">Your move · </span>}
      {situationPhrase(situation)}
    </p>
  )
}
