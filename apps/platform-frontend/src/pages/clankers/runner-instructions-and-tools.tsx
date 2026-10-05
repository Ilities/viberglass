import { Button } from '@/components/button'
import { Subheading } from '@/components/heading'
import { listMcpServers } from '@/service/api/mcp-server-api'
import { listSkills } from '@/service/api/skill-api'
import { Pencil1Icon } from '@radix-ui/react-icons'
import type { Clanker } from '@viberglass/types'
import { useEffect, useState } from 'react'

function names(all: Array<{ id: string; name: string }>, ids: string[]): string[] {
  return ids.map((id) => all.find((entry) => entry.id === id)?.name ?? 'Removed from the workspace')
}

function Row({ label, values, empty }: { label: string; values: string[]; empty: string }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 py-2 text-sm">
      <span className="w-28 shrink-0 text-[var(--gray-10)]">{label}</span>
      <span className="min-w-0 flex-1 text-[var(--gray-12)]">{values.length > 0 ? values.join(', ') : <span className="text-[var(--gray-9)]">{empty}</span>}</span>
    </div>
  )
}

/**
 * What the runner brings to every task besides its model: the instructions it
 * reads (AGENTS.md, the harness's own config) and the tools it may use (MCP
 * servers and skills). They're changed on the edit page, under Advanced.
 */
export function RunnerInstructionsAndTools({ clanker }: { clanker: Clanker }) {
  const [mcpServers, setMcpServers] = useState<Array<{ id: string; name: string }>>([])
  const [skills, setSkills] = useState<Array<{ id: string; name: string }>>([])
  const editHref = `/settings/agents/${clanker.slug}/edit?section=tools`

  useEffect(() => {
    if (clanker.mcpServerIds.length > 0) listMcpServers().then(setMcpServers).catch(() => undefined)
    if (clanker.skillIds.length > 0) listSkills().then(setSkills).catch(() => undefined)
  }, [clanker.mcpServerIds.length, clanker.skillIds.length])

  const nothing = clanker.configFiles.length === 0 && clanker.mcpServerIds.length === 0 && clanker.skillIds.length === 0

  return (
    <div className="app-frame rounded-lg p-6">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
        <Subheading>Instructions and tools</Subheading>
        {!nothing && (
          <Button href={editHref} outline>
            <Pencil1Icon className="h-4 w-4" />
            Change
          </Button>
        )}
      </div>
      <p className="mb-4 text-sm text-[var(--gray-10)]">What the agent reads before every task, and the MCP servers and skills it may use.</p>
      {nothing ? (
        <div className="rounded border border-dashed border-[var(--gray-6)] bg-[var(--gray-2)] p-6 text-center">
          <p className="text-sm text-[var(--gray-10)]">
            No instructions or tools yet. Add an AGENTS.md with your conventions, or give the agent MCP servers and skills.
          </p>
          <Button href={editHref} className="mt-4" outline>
            <Pencil1Icon className="h-4 w-4" />
            Add instructions or tools
          </Button>
        </div>
      ) : (
        <>
          <div className="divide-y divide-[var(--gray-5)]">
            <Row label="MCP servers" values={names(mcpServers, clanker.mcpServerIds)} empty="None" />
            <Row label="Skills" values={names(skills, clanker.skillIds)} empty="None" />
            <Row label="Instructions" values={clanker.configFiles.map((file) => file.fileType)} empty="None" />
          </div>
          {clanker.configFiles.map((file) => (
            <details key={file.id} className="mt-3">
              <summary className="cursor-pointer text-xs font-medium text-[var(--gray-10)] hover:text-[var(--gray-12)]">{file.fileType}</summary>
              <pre className="mt-2 rounded bg-[var(--gray-3)] p-4 font-mono text-sm break-all whitespace-pre-wrap text-[var(--gray-11)]">{file.content}</pre>
            </details>
          ))}
        </>
      )}
    </div>
  )
}
