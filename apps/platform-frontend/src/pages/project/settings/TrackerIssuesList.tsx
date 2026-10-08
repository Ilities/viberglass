import type { TrackerIssueRule } from '@/service/api/integration-api'
import { useState } from 'react'
import { TrackerIssuesCard, type TrackerConnection } from './TrackerIssuesCard'

interface TrackerIssuesListProps {
  projectId: string
  connections: TrackerConnection[]
  repository: string | null
  onSaved: (connection: TrackerConnection, rules: TrackerIssueRule[]) => void
}

export function TrackerIssuesList({ projectId, connections, repository, onSaved }: TrackerIssuesListProps) {
  const [editingId, setEditingId] = useState<string | null>(null)

  return (
    <div className="app-frame @container mt-8 overflow-hidden rounded-lg">
      <div
        aria-hidden="true"
        className="hidden grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_6rem_3.5rem] items-center gap-4 border-b border-zinc-950/10 bg-zinc-950/[0.02] px-5 py-3 text-xs font-medium text-zinc-500 @min-[560px]:grid dark:border-white/10 dark:bg-white/[0.02] dark:text-zinc-400"
      >
        <span>Connection</span>
        <span>Create tasks for</span>
        <span>Automatic planning</span>
        <span />
      </div>
      {connections.map((connection) => (
        <TrackerIssuesCard
          key={connection.id}
          projectId={projectId}
          connection={connection}
          repository={repository}
          isEditing={editingId === connection.id}
          editDisabled={editingId !== null && editingId !== connection.id}
          onEdit={() => setEditingId(connection.id)}
          onClose={() => setEditingId(null)}
          onSaved={(rules) => onSaved(connection, rules)}
        />
      ))}
    </div>
  )
}
