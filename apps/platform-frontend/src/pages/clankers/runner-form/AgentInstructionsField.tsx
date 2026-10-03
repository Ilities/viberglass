import { Button } from '@/components/button'
import { Description, Field, Label } from '@/components/fieldset'
import { Textarea } from '@/components/textarea'
import { useRef, type ChangeEvent } from 'react'

interface AgentInstructionsFieldProps {
  agentInstructions: string
  onAgentInstructionsChange: (content: string) => void
  onError: (message: string | null) => void
}

/** The runner's AGENTS.md, typed in or uploaded as markdown. */
export function AgentInstructionsField({ agentInstructions, onAgentInstructionsChange, onError }: AgentInstructionsFieldProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  async function handleUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return

    if (!file.name.toLowerCase().endsWith('.md')) {
      onError('AGENTS upload must be a .md file.')
      return
    }

    onAgentInstructionsChange(await file.text())
    onError(null)
    event.target.value = ''
  }

  return (
    <Field>
      <div className="flex items-center justify-between">
        <Label>AGENTS.md</Label>
        <input ref={fileInputRef} type="file" accept=".md,text/markdown" onChange={handleUpload} className="hidden" />
        <Button type="button" outline onClick={() => fileInputRef.current?.click()}>
          Upload .md
        </Button>
      </div>
      <Description>Main instruction file used to guide this agent runner.</Description>
      <Textarea
        rows={8}
        value={agentInstructions}
        onChange={(event) => onAgentInstructionsChange(event.target.value)}
        placeholder="Describe how this agent runner should behave..."
        className="font-mono"
      />
    </Field>
  )
}
