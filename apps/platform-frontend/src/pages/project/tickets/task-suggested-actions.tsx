import { Button } from '@/components/button'
import { askAgent } from '@/service/api/discussion-api'
import { useState } from 'react'
import { toast } from 'sonner'
import type { ComposerDraft } from './composer-draft'
import type { TaskSuggestion } from './task-suggestions'

interface TaskSuggestedActionsProps {
  taskId: string
  suggestions: TaskSuggestion[]
  agentWorking: boolean
  onAsked: () => void
  /** What's written in the composer: a suggestion sends it as the request, in place of its own words. */
  draft?: ComposerDraft
  /** More ways to ask, at the end of the same row: bringing in another agent. */
  trailing?: React.ReactNode
}

/** Asking the agent with what's written in the composer, else the suggestion's words, one ask at a time. */
function useAskSuggestion(taskId: string, onAsked: () => void, draft?: ComposerDraft) {
  const [asking, setAsking] = useState<string | null>(null)
  async function ask(suggestion: TaskSuggestion) {
    setAsking(suggestion.label)
    const written = draft && !draft.isEmpty ? draft : null
    try {
      await askAgent(taskId, {
        action: suggestion.action,
        body: written ? written.body() : suggestion.label,
        agentId: suggestion.agentId,
        parts: suggestion.parts,
      })
      written?.clear()
      onAsked()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't ask the agent")
    } finally {
      setAsking(null)
    }
  }
  return { asking, ask }
}

/** Trying a failed turn again, beside the turn; it posts the suggestion's words in the thread like any ask. */
export function RetryTurnButton({ taskId, suggestion, onAsked }: { taskId: string; suggestion: TaskSuggestion; onAsked: () => void }) {
  const { asking, ask } = useAskSuggestion(taskId, onAsked)
  return (
    <Button outline disabled={asking !== null} onClick={() => void ask(suggestion)}>
      {asking ? 'Asking…' : 'Try again'}
    </Button>
  )
}

/**
 * The common next moves, in one row under the composer, the likeliest first:
 * each posts what's written in the composer, or its own words, and asks the agent.
 */
export function TaskSuggestedActions({ taskId, suggestions, agentWorking, onAsked, draft, trailing }: TaskSuggestedActionsProps) {
  const { asking, ask } = useAskSuggestion(taskId, onAsked, draft)
  if (agentWorking || (suggestions.length === 0 && !trailing)) return null
  return (
    <div role="group" aria-label="Suggested actions" className="flex flex-wrap items-center gap-2">
      {suggestions.map((suggestion, index) => (
        <Button
          key={suggestion.label}
          {...(index === 0 ? { color: 'brand' as const } : { outline: true as const })}
          disabled={asking !== null}
          onClick={() => void ask(suggestion)}
        >
          {asking === suggestion.label ? 'Asking…' : suggestion.label}
        </Button>
      ))}
      {trailing}
    </div>
  )
}
