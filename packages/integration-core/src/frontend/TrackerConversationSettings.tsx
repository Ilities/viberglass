import type { ReactNode } from 'react'

interface TrackerConversationSettingsProps {
  /** "Jira", "Shortcut", "GitHub". */
  tracker: string
  /** What the tracker calls an issue: "story" in Shortcut. */
  item?: string
  idPrefix: string
  planNewIssues: boolean
  onPlanNewIssuesChange: (value: boolean) => void
  botUsername: string
  onBotUsernameChange: (value: string) => void
  /** What to enter as the bot's name in this tracker. */
  botUsernameHint: string
  botUsernamePlaceholder: string
  /** Narrows which new issues get a plan, such as GitHub's labels. */
  children?: ReactNode
}

/**
 * How a tracker's issues take part in their tasks: whether the agent writes a
 * plan for each new issue, and the account whose mention in a comment asks it.
 */
export function TrackerConversationSettings({
  tracker,
  item = 'issue',
  idPrefix,
  planNewIssues,
  onPlanNewIssuesChange,
  botUsername,
  onBotUsernameChange,
  botUsernameHint,
  botUsernamePlaceholder,
  children,
}: TrackerConversationSettingsProps) {
  return (
    <div className="space-y-4 pt-2">
      <div className="rounded-md border border-[var(--gray-6)] bg-[var(--gray-3)] p-4 text-xs text-[var(--gray-10)]">
        <p className="text-sm font-medium text-[var(--gray-12)]">How {item}s work with their tasks</p>
        <ul className="mt-2 list-inside list-disc space-y-1">
          <li>A new {tracker} {item} creates a task in the space, linked to the {item}.</li>
          <li>Edits to the {item} update the task&apos;s title and description.</li>
          <li>Comments on the {item} appear in the task&apos;s thread. A comment that mentions the bot asks the agent.</li>
          <li>
            Viberglass posts the plan, the agent&apos;s questions, the pull request and when it&apos;s done back to the {item},
            with this connection&apos;s token.
          </li>
        </ul>
      </div>

      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          id={`${idPrefix}PlanNewIssues`}
          checked={planNewIssues}
          onChange={(event) => onPlanNewIssuesChange(event.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-[var(--gray-7)] bg-[var(--gray-3)] text-[var(--accent-9)] focus:ring-[var(--accent-9)]"
        />
        <label htmlFor={`${idPrefix}PlanNewIssues`} className="text-sm text-[var(--gray-12)]">
          Write the plan for new {item}s
          <span className="block text-xs text-[var(--gray-10)]">
            Off, the task waits until someone asks the agent, in Viberglass or by mentioning the bot on the {item}.
          </span>
        </label>
      </div>
      {children}

      <div>
        <label htmlFor={`${idPrefix}BotUsername`} className="block text-xs font-medium uppercase tracking-wider text-[var(--gray-9)]">
          Bot account
        </label>
        <input
          id={`${idPrefix}BotUsername`}
          type="text"
          value={botUsername}
          onChange={(event) => onBotUsernameChange(event.target.value)}
          placeholder={botUsernamePlaceholder}
          className="mt-1 w-full rounded-md border border-[var(--gray-7)] bg-[var(--gray-2)] px-3 py-2 text-sm text-[var(--gray-12)]"
        />
        <p className="mt-1.5 text-xs text-[var(--gray-9)]">{botUsernameHint}</p>
      </div>
    </div>
  )
}
