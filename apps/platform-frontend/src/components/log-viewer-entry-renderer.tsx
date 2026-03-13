import { AgentAction, AgentMessage, AgentObservation } from '@/components/ai-elements/agent'
import { Message } from '@/components/ai-elements/message'
import { Reasoning } from '@/components/ai-elements/reasoning'
import { Terminal } from '@/components/ai-elements/terminal'
import {
  AGENT_COLOR_CLASSES,
  COMMAND_OUTPUT_PREVIEW_LIMIT,
  type CommandBatchDisplayEntry,
  type DisplayEntry,
  clipText,
  formatTime,
  getAgentColor,
  getToolState,
  oneLine,
} from '@/components/log-viewer-utils'

export interface EntryCallbacks {
  expanded: Set<string>
  rawExpanded: Set<string>
  expandedCmds: Set<string>
  toggle: (id: string) => void
  toggleRaw: (id: string) => void
  toggleCmd: (id: string) => void
}

export function AgentPill({ sourceLabel }: { sourceLabel: string }) {
  const color = getAgentColor(sourceLabel)
  const classes = AGENT_COLOR_CLASSES[color] ?? AGENT_COLOR_CLASSES.gray
  const name = sourceLabel.replace(/^agent:/, '')
  return (
    <span
      className={`inline-flex items-center rounded px-1.5 py-0.5 font-mono text-[9px] font-semibold ${classes.badge}`}
    >
      {name}
    </span>
  )
}

export function ToggleButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="self-start rounded border border-[var(--gray-6)] px-2 py-1 font-mono text-[10px] font-medium text-[var(--gray-11)] transition hover:bg-[var(--gray-3)]"
    >
      {label}
    </button>
  )
}

function renderBatch(entry: CommandBatchDisplayEntry, ctx: EntryCallbacks) {
  const detailsId = `batch:${entry.id}`
  const outputId = `batch-output:${entry.id}`
  const isExpanded = ctx.expanded.has(detailsId)
  const isOutputExpanded = ctx.rawExpanded.has(outputId)
  const combinedOutput = entry.events.map((e) => `$ ${e.command}\n${e.output || '(no output)'}`).join('\n\n')

  return (
    <AgentAction
      state="output-available"
      title={`${formatTime(entry.createdAt)}–${formatTime(entry.completedAt)} · ${entry.events.length} tool calls`}
    >
      <div className="flex items-start gap-2">
        <AgentPill sourceLabel={entry.sourceLabel} />
        <div className="min-w-0 font-mono text-[11px] text-[var(--gray-11)]">
          {entry.events
            .slice(0, 3)
            .map((e) => oneLine(e.command, 120))
            .join('\n')}
          {entry.events.length > 3 ? `\n+ ${entry.events.length - 3} more` : ''}
        </div>
      </div>
      <ToggleButton onClick={() => ctx.toggle(detailsId)} label={isExpanded ? 'Hide tool batch' : 'Show tool batch'} />
      {isExpanded && (
        <>
          <pre className="overflow-x-auto rounded border border-[var(--gray-6)] bg-[var(--gray-1)] px-2 py-1.5 font-mono text-[11px] leading-relaxed text-[var(--gray-12)]">
            {entry.events.map((e, i) => `${i + 1}. ${e.command}`).join('\n')}
          </pre>
          <Terminal maxHeight={isOutputExpanded ? undefined : 'max-h-80'}>
            {clipText(combinedOutput, isOutputExpanded ? Number.MAX_SAFE_INTEGER : COMMAND_OUTPUT_PREVIEW_LIMIT * 3)}
          </Terminal>
          {combinedOutput.length > COMMAND_OUTPUT_PREVIEW_LIMIT * 3 && (
            <ToggleButton
              onClick={() => ctx.toggleRaw(outputId)}
              label={isOutputExpanded ? 'Collapse grouped output' : 'Expand grouped output'}
            />
          )}
        </>
      )}
    </AgentAction>
  )
}

export function renderEntry(entry: DisplayEntry, ctx: EntryCallbacks): React.ReactNode {
  if (entry.kind === 'command_batch') return renderBatch(entry, ctx)

  const { event } = entry

  if (event.kind === 'agent_message') {
    const entryId = `message:${event.id}`
    const isExpanded = ctx.expanded.has(entryId)
    const summary = oneLine(event.text, 220)
    return (
      <AgentMessage>
        <div className="mb-1 flex items-center gap-2 font-mono text-[10px] text-[var(--gray-9)]">
          <AgentPill sourceLabel={event.sourceLabel} />
          <span>{formatTime(event.createdAt)}</span>
        </div>
        <Message>{isExpanded ? event.text : summary}</Message>
        {event.text.length > 220 && (
          <ToggleButton
            onClick={() => ctx.toggle(entryId)}
            label={isExpanded ? 'Collapse message' : 'Expand message'}
          />
        )}
      </AgentMessage>
    )
  }

  if (event.kind === 'reasoning') {
    return (
      <Reasoning title={`Reasoning · ${formatTime(event.createdAt)}`}>
        <div className="mb-1">
          <AgentPill sourceLabel={event.sourceLabel} />
        </div>
        {event.text}
      </Reasoning>
    )
  }

  if (event.kind === 'command_execution') {
    const toolState = getToolState(event)
    const detailsId = `command:${event.commandId}`
    const isDetailsExpanded = ctx.expanded.has(detailsId)
    const shouldExpand = ctx.expandedCmds.has(event.commandId)
    const outputText = event.output || (event.state === 'running' ? 'Waiting for command output...' : '')
    const clipped =
      outputText.length > COMMAND_OUTPUT_PREVIEW_LIMIT && !shouldExpand
        ? clipText(outputText, COMMAND_OUTPUT_PREVIEW_LIMIT)
        : outputText

    return (
      <AgentAction
        state={toolState}
        title={`${formatTime(event.createdAt)} · ${event.exitCode !== null ? `exit ${event.exitCode}` : event.state}`}
      >
        <div className="flex items-center gap-2">
          <AgentPill sourceLabel={event.sourceLabel} />
          <p className="truncate font-mono text-[11px] text-[var(--gray-11)]">{oneLine(event.command, 180)}</p>
        </div>
        <ToggleButton
          onClick={() => ctx.toggle(detailsId)}
          label={isDetailsExpanded ? 'Hide command details' : 'Show command details'}
        />
        {isDetailsExpanded && (
          <>
            <pre className="overflow-x-auto rounded border border-[var(--gray-6)] bg-[var(--gray-1)] px-2 py-1.5 font-mono text-[11px] leading-relaxed text-[var(--gray-12)]">
              {event.command}
            </pre>
            <Terminal>{clipped || '(no output)'}</Terminal>
          </>
        )}
        {outputText.length > COMMAND_OUTPUT_PREVIEW_LIMIT && isDetailsExpanded && (
          <ToggleButton
            onClick={() => ctx.toggleCmd(event.commandId)}
            label={shouldExpand ? 'Collapse output' : 'Expand output'}
          />
        )}
      </AgentAction>
    )
  }

  if (event.kind === 'file_change') {
    const entryId = `file-change:${event.id}`
    const isExpanded = ctx.expanded.has(entryId)
    return (
      <AgentObservation title={`file changes · ${formatTime(event.createdAt)}`}>
        <div className="mb-1 flex items-center gap-2">
          <AgentPill sourceLabel={event.sourceLabel} />
          <p className="font-mono text-[11px] text-[var(--gray-11)]">{event.changes.length} files changed</p>
        </div>
        <ToggleButton onClick={() => ctx.toggle(entryId)} label={isExpanded ? 'Hide file list' : 'Show file list'} />
        {isExpanded && (
          <pre className="mt-2 overflow-x-auto rounded border border-[var(--gray-6)] bg-[var(--gray-1)] px-2 py-1.5 font-mono text-[11px] leading-relaxed text-[var(--gray-12)]">
            {event.changes.length > 0
              ? event.changes.map((c) => `${c.kind.toUpperCase()} ${c.path}`).join('\n')
              : 'No file change details provided'}
          </pre>
        )}
      </AgentObservation>
    )
  }

  if (event.kind === 'raw') {
    const entryId = `raw:${event.id}`
    const isExpanded = ctx.expanded.has(entryId)
    const isViberator = event.sourceLabel === 'viberator'
    const isError = event.level === 'error'
    const needsExpand = event.text.length > 200 || event.text.includes('\n')
    const displayText = needsExpand && !isExpanded ? oneLine(event.text, 200) : event.text

    if (isError) {
      return (
        <AgentObservation state="output-error" title={`Error · ${formatTime(event.createdAt)}`}>
          <div className="mb-1 flex items-start gap-2">
            {!isViberator && <AgentPill sourceLabel={event.sourceLabel} />}
            <p className="break-words whitespace-pre-wrap font-mono text-[11px] text-[var(--gray-12)]">{displayText}</p>
          </div>
          {needsExpand && (
            <ToggleButton onClick={() => ctx.toggle(entryId)} label={isExpanded ? 'Hide details' : 'Show details'} />
          )}
        </AgentObservation>
      )
    }

    return (
      <div className="flex items-start gap-3 px-2 py-[3px] text-[11px]">
        <span className="mt-[1px] shrink-0 font-mono text-[var(--gray-8)]">{formatTime(event.createdAt)}</span>
        {!isViberator && <AgentPill sourceLabel={event.sourceLabel} />}
        <span className="break-words whitespace-pre-wrap leading-relaxed text-[var(--gray-10)]">{displayText}</span>
        {needsExpand && (
          <button
            type="button"
            onClick={() => ctx.toggle(entryId)}
            className="shrink-0 font-mono text-[9px] text-[var(--accent-9)] hover:underline"
          >
            {isExpanded ? 'less' : 'more…'}
          </button>
        )}
      </div>
    )
  }

  return null
}
