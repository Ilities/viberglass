import type { TimelineEvent } from '@/components/agent-log-model'

/** What the agent did during a run, counted the way a person would describe it. */
export interface AgentWorkSummary {
  filesRead: number
  searches: number
  commandsRun: number
  changedFiles: string[]
  messages: string[]
}

type CommandKind = 'read' | 'search' | 'change' | 'command'

// Harnesses report their file tools as commands ("read /repo/README.md").
const KIND_OF_TOOL: Record<string, CommandKind> = {
  read: 'read',
  cat: 'read',
  glob: 'search',
  grep: 'search',
  rg: 'search',
  find: 'search',
  ls: 'search',
  write: 'change',
  edit: 'change',
  patch: 'change',
  apply_patch: 'change',
}

function classify(command: string): { kind: CommandKind; target: string | null } {
  const [tool = '', target = null] = command.trim().split(/\s+/, 2)
  return { kind: KIND_OF_TOOL[tool] ?? 'command', target }
}

export function summariseAgentWork(timeline: TimelineEvent[]): AgentWorkSummary {
  const summary: AgentWorkSummary = { filesRead: 0, searches: 0, commandsRun: 0, changedFiles: [], messages: [] }
  const changed = new Set<string>()
  const seenCommands = new Set<string>()

  for (const event of timeline) {
    if (event.kind === 'agent_message' && event.text.trim()) {
      summary.messages.push(event.text.trim())
    } else if (event.kind === 'file_change') {
      event.changes.forEach((change) => changed.add(change.path))
    } else if (event.kind === 'command_execution' && !seenCommands.has(event.commandId)) {
      seenCommands.add(event.commandId)
      const { kind, target } = classify(event.command)
      if (kind === 'read') summary.filesRead += 1
      else if (kind === 'search') summary.searches += 1
      else if (kind === 'change' && target) changed.add(target)
      else summary.commandsRun += 1
    }
  }

  summary.changedFiles = [...changed]
  return summary
}

function plural(n: number, singular: string, pluralForm = `${singular}s`): string {
  return `${n} ${n === 1 ? singular : pluralForm}`
}

/** Short chips such as "read 14 files", omitting what didn't happen. */
export function describeAgentWork(summary: AgentWorkSummary): string[] {
  const chips: string[] = []
  if (summary.filesRead > 0) chips.push(`read ${plural(summary.filesRead, 'file')}`)
  if (summary.searches > 0) chips.push(`searched ${plural(summary.searches, 'time')}`)
  if (summary.commandsRun > 0) chips.push(`ran ${plural(summary.commandsRun, 'command')}`)
  if (summary.changedFiles.length > 0) chips.push(`changed ${plural(summary.changedFiles.length, 'file')}`)
  return chips
}
