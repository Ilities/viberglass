import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Heading } from '@/components/heading'
import { PageMeta } from '@/components/page-meta'
import {
  type PromptTemplateEntry,
  type PromptType,
  listSystemPromptTemplates,
  updateSystemPromptTemplate,
} from '@/service/api/prompt-template-api'
import { renderTemplatePreview } from '../project/prompt-templates/renderTemplatePreview'

interface SystemTemplateCardProps {
  entry: PromptTemplateEntry
  onSave: (type: PromptType, template: string) => Promise<void>
}

function SystemTemplateCard({ entry, onSave }: SystemTemplateCardProps) {
  const [value, setValue] = useState(entry.effectiveTemplate)
  const [saving, setSaving] = useState(false)
  const [expanded, setExpanded] = useState(false)

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

  return (
    <div className="rounded-lg border border-zinc-200 dark:border-zinc-800">
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        className="flex w-full items-start justify-between gap-3 p-4 text-left"
      >
        <div className="min-w-0">
          <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{entry.label}</p>
          <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">{entry.description}</p>
        </div>
        <span className="mt-0.5 shrink-0 text-xs text-zinc-400 dark:text-zinc-500">
          {expanded ? 'Collapse' : 'Expand'}
        </span>
      </button>

      {expanded && (
        <div className="border-t border-zinc-200 px-4 pb-4 pt-3 dark:border-zinc-800">
          <textarea
            className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 font-mono text-xs text-zinc-900 focus:border-zinc-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
            rows={8}
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />

          <div className="mt-2 rounded-md bg-zinc-50 px-3 py-2 dark:bg-zinc-800/50">
            <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-500">Preview</p>
            <div className="text-xs leading-5">
              {renderTemplatePreview(value)}
            </div>
          </div>

          <div className="mt-3">
            <button
              onClick={handleSave}
              disabled={saving}
              className="rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export function PromptTemplatesPage() {
  const [entries, setEntries] = useState<PromptTemplateEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    listSystemPromptTemplates()
      .then((data) => {
        setEntries(data)
        setLoading(false)
      })
      .catch((err: unknown) => {
        setLoadError(err instanceof Error ? err.message : 'Failed to load templates')
        setLoading(false)
      })
  }, [])

  const handleSave = async (type: PromptType, template: string) => {
    try {
      const updated = await updateSystemPromptTemplate(type, template)
      setEntries((prev) => prev.map((e) => (e.type === type ? updated : e)))
      toast.success('Template saved')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save template')
    }
  }

  return (
    <>
      <PageMeta title="Prompt Templates" />
      <div className="space-y-8">
        <div>
          <Heading>Prompt Templates</Heading>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            Edit the system default prompts used across all projects. Individual projects can override these in their own settings.
          </p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="text-zinc-500 dark:text-zinc-400">Loading…</div>
          </div>
        ) : loadError ? (
          <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
            {loadError}
          </div>
        ) : (
          <div className="grid gap-3">
            {entries.map((entry) => (
              <SystemTemplateCard
                key={entry.type}
                entry={entry}
                onSave={handleSave}
              />
            ))}
          </div>
        )}
      </div>
    </>
  )
}
