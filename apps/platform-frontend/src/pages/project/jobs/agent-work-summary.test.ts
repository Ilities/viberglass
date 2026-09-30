import { buildLogTimeline } from '@/components/agent-log-model'
import type { LogEntry } from '@/service/api/job-api'
import { describeAgentWork, summariseAgentWork } from './agent-work-summary'

let id = 0
function agentLine(item: Record<string, unknown>, type = 'item.completed'): LogEntry {
  id += 1
  return {
    id: `log-${id}`,
    level: 'info',
    source: 'viberator',
    createdAt: `2026-09-30T10:00:${String(id).padStart(2, '0')}Z`,
    message: `[agent:opencode:stdout] ${JSON.stringify({ type, item })}`,
  }
}

const command = (commandId: string, commandText: string) => [
  agentLine({ type: 'command_execution', id: commandId, command: commandText }, 'item.started'),
  agentLine({ type: 'command_execution', id: commandId, command: commandText }),
]

describe('summariseAgentWork', () => {
  const logs: LogEntry[] = [
    { id: 'plain', level: 'info', source: 'viberator', createdAt: '2026-09-30T09:59:00Z', message: 'Cloning repository' },
    ...command('c1', 'read /repo/package.json'),
    ...command('c2', 'read /repo/README.md'),
    ...command('c3', 'glob **/*.md'),
    ...command('c4', 'cd /repo && npm test'),
    ...command('c5', 'write /repo/RESEARCH.md'),
    agentLine({ type: 'agent_message', text: 'Created RESEARCH.md summarising the README.' }),
  ]

  it('counts each command once, by kind, and keeps the agent\'s messages', () => {
    const summary = summariseAgentWork(buildLogTimeline(logs))

    expect(summary).toEqual({
      filesRead: 2,
      searches: 1,
      commandsRun: 1,
      changedFiles: ['/repo/RESEARCH.md'],
      messages: ['Created RESEARCH.md summarising the README.'],
    })
  })

  it('describes the work in short chips, leaving out what did not happen', () => {
    const summary = { filesRead: 14, searches: 1, commandsRun: 0, changedFiles: ['a.ts', 'b.ts'], messages: [] }
    expect(describeAgentWork(summary)).toEqual(['read 14 files', 'searched 1 time', 'changed 2 files'])
  })
})
