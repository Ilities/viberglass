import { Button } from '@/components/button'
import { Description, Field, Label } from '@/components/fieldset'
import { Select } from '@/components/select'
import { Textarea } from '@/components/textarea'
import type { AgentType } from '@viberglass/types'
import { useRef } from 'react'
import { describeJsonProblem, findReferencedEnvVars, formatReference } from '../config/harnessReferences'
import { getHarnessConfigFile } from '../instructionFiles'

const INSERT_PROMPT = 'insert'

interface HarnessConfigEditorProps {
  agent: AgentType | ''
  enabled: boolean
  content: string
  /** The env vars this runner gives the agent, which the file may refer to. */
  boundEnvVars: string[]
  onEnable: () => void
  onRemove: () => void
  onChange: (content: string) => void
}

/** The agent's own config file, with references to the runner's secrets checked as you type. */
export function HarnessConfigEditor({
  agent,
  enabled,
  content,
  boundEnvVars,
  onEnable,
  onRemove,
  onChange,
}: HarnessConfigEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const config = getHarnessConfigFile(agent)
  if (!config) return null

  if (!enabled) {
    return (
      <Field>
        <Button type="button" outline onClick={onEnable}>
          Add {config.label}
        </Button>
      </Field>
    )
  }

  const { fileType } = config
  const jsonProblem = describeJsonProblem(content)
  const unbound = findReferencedEnvVars(fileType, content).filter((name) => !boundEnvVars.includes(name))

  function insertReference(name: string) {
    const reference = formatReference(fileType, name)
    const textarea = textareaRef.current
    const start = textarea?.selectionStart ?? content.length
    const end = textarea?.selectionEnd ?? content.length
    onChange(`${content.slice(0, start)}${reference}${content.slice(end)}`)
  }

  return (
    <Field>
      <div className="flex items-center justify-between">
        <Label>{config.label}</Label>
        <Button type="button" plain onClick={onRemove}>
          Remove
        </Button>
      </div>
      <Description>
        {config.referenceHint} Only model-provider variables and the secrets this runner exposes reach the agent.
      </Description>
      {boundEnvVars.length > 0 && (
        <div className="mt-3 max-w-xs">
          <Select value={INSERT_PROMPT} onChange={(value) => value !== INSERT_PROMPT && insertReference(value)}>
            <option value={INSERT_PROMPT}>Insert a reference to…</option>
            {boundEnvVars.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </Select>
        </div>
      )}
      <Textarea
        ref={textareaRef}
        rows={12}
        value={content}
        onChange={(event) => onChange(event.target.value)}
        placeholder={config.placeholder}
        className="mt-3 font-mono text-sm"
      />
      {jsonProblem && <p className="mt-2 text-sm text-red-600 dark:text-red-400">Not valid JSON: {jsonProblem}</p>}
      {unbound.length > 0 && (
        <p className="mt-2 text-sm text-amber-700 dark:text-amber-400">
          This runner doesn&apos;t expose {unbound.join(', ')}. Add {unbound.length === 1 ? 'it' : 'them'} under Extra
          environment variables, or the agent will see no value.
        </p>
      )}
    </Field>
  )
}
