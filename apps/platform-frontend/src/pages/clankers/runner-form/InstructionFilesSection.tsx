import { Button } from '@/components/button'
import { Description, Field, FieldGroup, Label } from '@/components/fieldset'
import { Input } from '@/components/input'
import { Textarea } from '@/components/textarea'
import { useRef, type ChangeEvent } from 'react'
import { skillPathFromUploadName } from '../instructionFiles'

export interface SkillEntry {
  id: string
  path: string
  content: string
}

export function createSkillEntry(path: string = 'skills/new-skill.md', content = ''): SkillEntry {
  return {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    path,
    content,
  }
}

interface InstructionFilesSectionProps {
  agentInstructions: string
  onAgentInstructionsChange: (content: string) => void
  skills: SkillEntry[]
  onSkillsChange: (update: (skills: SkillEntry[]) => SkillEntry[]) => void
  onError: (message: string | null) => void
}

/** AGENTS.md and the skills under skills/, typed in or uploaded as markdown. */
export function InstructionFilesSection({
  agentInstructions,
  onAgentInstructionsChange,
  skills,
  onSkillsChange,
  onError,
}: InstructionFilesSectionProps) {
  const agentsFileInputRef = useRef<HTMLInputElement | null>(null)
  const skillsFileInputRef = useRef<HTMLInputElement | null>(null)

  async function handleAgentsUpload(event: ChangeEvent<HTMLInputElement>) {
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

  async function handleSkillsUpload(event: ChangeEvent<HTMLInputElement>) {
    const files = event.target.files
    if (!files || files.length === 0) return

    const uploaded: SkillEntry[] = []
    for (const file of Array.from(files)) {
      if (!file.name.toLowerCase().endsWith('.md')) {
        onError(`Skipped ${file.name}: only .md files are allowed for skills.`)
        continue
      }
      uploaded.push(createSkillEntry(skillPathFromUploadName(file.name), await file.text()))
    }

    if (uploaded.length > 0) {
      onSkillsChange((previous) => [...previous, ...uploaded])
      onError(null)
    }
    event.target.value = ''
  }

  function updateSkill(id: string, updates: Partial<SkillEntry>) {
    onSkillsChange((previous) => previous.map((entry) => (entry.id === id ? { ...entry, ...updates } : entry)))
  }

  return (
    <FieldGroup className="mt-6">
      <Field>
        <div className="flex items-center justify-between">
          <Label>AGENTS.md</Label>
          <input
            ref={agentsFileInputRef}
            type="file"
            accept=".md,text/markdown"
            onChange={handleAgentsUpload}
            className="hidden"
          />
          <Button type="button" outline onClick={() => agentsFileInputRef.current?.click()}>
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

      <Field>
        <div className="flex items-center justify-between">
          <Label>Skill Files (skills/**)</Label>
          <div className="flex gap-2">
            <input
              ref={skillsFileInputRef}
              type="file"
              multiple
              accept=".md,text/markdown"
              onChange={handleSkillsUpload}
              className="hidden"
            />
            <Button type="button" outline onClick={() => skillsFileInputRef.current?.click()}>
              Upload .md Files
            </Button>
            <Button type="button" outline onClick={() => onSkillsChange((previous) => [...previous, createSkillEntry()])}>
              Add Skill
            </Button>
          </div>
        </div>
        <Description>Each skill must use a path under skills/, for example skills/review.md.</Description>
      </Field>

      {skills.length === 0 ? (
        <div className="rounded-lg border border-dashed border-zinc-300 p-4 text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
          No skill files yet. Add one manually or upload markdown files.
        </div>
      ) : (
        skills.map((skill) => (
          <div key={skill.id} className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
            <div className="mb-3 flex items-center gap-2">
              <Input
                value={skill.path}
                onChange={(event) => updateSkill(skill.id, { path: event.target.value })}
                placeholder="skills/example.md"
                className="font-mono"
              />
              <Button
                type="button"
                plain
                onClick={() => onSkillsChange((previous) => previous.filter((entry) => entry.id !== skill.id))}
              >
                Remove
              </Button>
            </div>
            <Textarea
              rows={6}
              value={skill.content}
              onChange={(event) => updateSkill(skill.id, { content: event.target.value })}
              placeholder="Skill instructions..."
              className="font-mono"
            />
          </div>
        ))
      )}
    </FieldGroup>
  )
}
