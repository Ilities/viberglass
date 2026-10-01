import { Button } from '@/components/button'
import { askAgent } from '@/service/api/discussion-api'
import { useState } from 'react'
import { toast } from 'sonner'
import type { TaskSuggestion } from './task-suggestions'

interface TaskSuggestedActionsProps {
  taskId: string
  suggestions: TaskSuggestion[]
  agentWorking: boolean
  onAsked: () => void
}

/** The common next moves, above the composer: each posts its words in the thread and asks the agent. */
export function TaskSuggestedActions({ taskId, suggestions, agentWorking, onAsked }: TaskSuggestedActionsProps) {
  const [asking, setAsking] = useState<string | null>(null)

  async function ask(suggestion: TaskSuggestion) {
    setAsking(suggestion.label)
    try {
      await askAgent(taskId, { action: suggestion.action, body: suggestion.label })
      onAsked()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't ask the agent")
    } finally {
      setAsking(null)
    }
  }

  if (agentWorking) {
    return <p className="text-xs text-[var(--gray-10)]">The agent is working. Messages you post now reach it when it finishes.</p>
  }
  if (suggestions.length === 0) return null
  return (
    <div role="group" aria-label="Suggested actions" className="flex flex-wrap gap-2">
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
    </div>
  )
}
