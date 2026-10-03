import { useEffect, useState } from 'react'
import { Checkbox, CheckboxField, CheckboxGroup } from '@/components/checkbox'
import { Description, Field, FieldGroup, Label } from '@/components/fieldset'
import { TextLink } from '@/components/text'
import { listMcpServers } from '@/service/api/mcp-server-api'
import { listSkills } from '@/service/api/skill-api'
import type { McpServer, Skill } from '@viberglass/types'

interface ToolsSectionProps {
  mcpServerIds: string[]
  skillIds: string[]
  onMcpServerIdsChange: (ids: string[]) => void
  onSkillIdsChange: (ids: string[]) => void
}

function toggle(ids: string[], id: string, checked: boolean): string[] {
  return checked ? [...ids.filter((other) => other !== id), id] : ids.filter((other) => other !== id)
}

function Picker<T extends { id: string; name: string; description?: string | null }>({
  items,
  selected,
  onChange,
  empty,
}: {
  items: T[]
  selected: string[]
  onChange: (ids: string[]) => void
  empty: React.ReactNode
}) {
  if (items.length === 0) return <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">{empty}</p>
  return (
    <CheckboxGroup className="mt-3">
      {items.map((item) => (
        <CheckboxField key={item.id}>
          <Checkbox checked={selected.includes(item.id)} onChange={(checked) => onChange(toggle(selected, item.id, checked === true))} />
          <Label className="font-mono">{item.name}</Label>
          {item.description && <Description className="line-clamp-2">{item.description}</Description>}
        </CheckboxField>
      ))}
    </CheckboxGroup>
  )
}

/** Which of the workspace's approved MCP servers and skills the runner's agent gets. */
export function ToolsSection({ mcpServerIds, skillIds, onMcpServerIdsChange, onSkillIdsChange }: ToolsSectionProps) {
  const [servers, setServers] = useState<McpServer[]>([])
  const [skills, setSkills] = useState<Skill[]>([])
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    Promise.all([listMcpServers(), listSkills()])
      .then(([servers, skills]) => {
        setServers(servers)
        setSkills(skills)
      })
      .catch(() => setFailed(true))
  }, [])

  if (failed) return <p className="text-sm text-red-600 dark:text-red-400">Couldn&apos;t load the workspace&apos;s MCP servers and skills.</p>

  return (
    <FieldGroup>
      <Field>
        <Label>MCP servers</Label>
        <Description>The agent can call every tool these servers offer during task conversations.</Description>
        <Picker
          items={servers}
          selected={mcpServerIds}
          onChange={onMcpServerIdsChange}
          empty={
            <>
              None approved yet. Approve servers on the <TextLink href="/settings/mcp-servers">MCP servers</TextLink> page.
            </>
          }
        />
      </Field>
      <Field>
        <Label>Skills</Label>
        <Description>Written where the agent looks for skills, so it can load one when a task calls for it.</Description>
        <Picker
          items={skills}
          selected={skillIds}
          onChange={onSkillIdsChange}
          empty={
            <>
              None uploaded yet. Upload skills on the <TextLink href="/settings/skills">Skills</TextLink> page.
            </>
          }
        />
      </Field>
    </FieldGroup>
  )
}
