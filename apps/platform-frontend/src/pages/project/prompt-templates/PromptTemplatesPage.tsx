import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { Heading } from '@/components/heading'
import { PageMeta } from '@/components/page-meta'
import { useProject } from '@/context/project-context'
import {
  type PromptTemplateEntry,
  type PromptType,
  listProjectPromptTemplates,
  updateProjectPromptTemplate,
  deleteProjectPromptTemplate,
} from '@/service/api/prompt-template-api'

interface TemplateCardProps {
  entry: PromptTemplateEntry
  onSave: (type: PromptType, template: string) => Promise<void>
  onReset: (type: PromptType) => Promise<void>
}

function TemplateCard({ entry, onSave, onReset }: TemplateCardProps) {
  const [value, setValue] = useState(entry.effectiveTemplate)
  const [saving, setSaving] = useState(false)
  const [resetting, setResetting] = useState(false)

  useEffect(() => {
    setValue(entry.effectiveTemplate)
  }, [entry.effectiveTemplate])

  const handleSave = async () => {
    setSaving(true)
    try {
      await onSave(entry.type, value)
    } finally {
      setSaving(false)
    }
  }

  const handleReset = async () => {
    setResetting(true)
    try {
      await onReset(entry.type)
    } finally {
      setResetting(false)
    }
  }

  return (
    <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      <div className="mb-1 flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{entry.label}</p>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">{entry.description}</p>
        </div>
        {!entry.isDefault && (
          <span className="shrink-0 rounded bg-blue-100 px-2 py-0.5 text-xs text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
            Custom
          </span>
        )}
      </div>

      <textarea
        className="mt-3 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 font-mono text-xs text-zinc-900 focus:border-zinc-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
        rows={6}
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />

      {!entry.isDefault && (
        <details className="mt-2">
          <summary className="cursor-pointer text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300">
            View system default
          </summary>
          <pre className="mt-1 overflow-x-auto rounded bg-zinc-50 p-2 font-mono text-xs text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
            {entry.systemDefault}
          </pre>
        </details>
      )}

      <div className="mt-3 flex gap-2">
        <button
          onClick={handleSave}
          disabled={saving}
          className="rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        {!entry.isDefault && (
          <button
            onClick={handleReset}
            disabled={resetting}
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            {resetting ? 'Resetting…' : 'Reset to default'}
          </button>
        )}
      </div>
    </div>
  )
}

export function PromptTemplatesPage() {
  const { project: projectSlug } = useParams<{ project: string }>()
  const { project, isLoading } = useProject()
  const [entries, setEntries] = useState<PromptTemplateEntry[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    if (!project) return
    listProjectPromptTemplates(project.id)
      .then(setEntries)
      .catch((err: unknown) => {
        setLoadError(err instanceof Error ? err.message : 'Failed to load templates')
      })
  }, [project])

  const handleSave = async (type: PromptType, template: string) => {
    if (!project) return
    try {
      const updated = await updateProjectPromptTemplate(project.id, type, template)
      setEntries((prev) => prev.map((e) => (e.type === type ? updated : e)))
      toast.success('Template saved')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save template')
    }
  }

  const handleReset = async (type: PromptType) => {
    if (!project) return
    try {
      await deleteProjectPromptTemplate(project.id, type)
      const refreshed = await listProjectPromptTemplates(project.id)
      setEntries(refreshed)
      toast.success('Template reset to system default')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to reset template')
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-zinc-500 dark:text-zinc-400">Loading…</div>
      </div>
    )
  }

  if (!project) return null

  return (
    <>
      <PageMeta title={projectSlug ? `${projectSlug} | Prompt Templates` : 'Prompt Templates'} />

      <div className="flex items-end justify-between">
        <div>
          <Heading>Prompt Templates</Heading>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Customize how prompts are built for each job type. Leave unchanged to use system defaults.
          </p>
        </div>
      </div>

      {loadError && (
        <div className="mt-6 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
          {loadError}
        </div>
      )}

      <div className="mt-6 grid gap-4">
        {entries.map((entry) => (
          <TemplateCard
            key={entry.type}
            entry={entry}
            onSave={handleSave}
            onReset={handleReset}
          />
        ))}
      </div>
    </>
  )
}
