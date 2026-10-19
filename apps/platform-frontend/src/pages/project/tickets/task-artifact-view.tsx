import { Button } from '@/components/button'
import { onTabListKeyDown } from '@/components/tab-button'
import { Select } from '@/components/select'
import { artifactPath, formatLabel } from '@/lib/artifacts'
import { formatTimestamp } from '@/lib/formatters'
import { downloadArtifactVersion, getArtifacts } from '@/service/api/artifact-api'
import type { ArtifactSummary } from '@viberglass/types'
import clsx from 'clsx'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { ArtifactPreviewView } from '../artifacts/artifact-preview'
import { stepPanelId, stepTabId } from './artifact-tab-ids'

export type FilesTaskTab = 'artifact' | 'plan'

const ARTIFACT_TAB_ID = 'task-artifact-tab-artifact'
const ARTIFACT_PANEL_ID = 'task-artifact-panel-artifact'

/** A task's artifacts, loaded again whenever `refreshKey` changes, such as when a run finishes. */
export function useTaskArtifacts(projectId: string | undefined, taskId: string, enabled: boolean, refreshKey: string) {
  const [artifacts, setArtifacts] = useState<ArtifactSummary[] | null>(null)
  useEffect(() => {
    if (!enabled || !projectId) return
    let cancelled = false
    getArtifacts(projectId, taskId)
      .then((list) => !cancelled && setArtifacts(list))
      .catch(() => !cancelled && setArtifacts((current) => current ?? []))
    return () => {
      cancelled = true
    }
  }, [projectId, taskId, enabled, refreshKey])
  return artifacts
}

/** A Files task's tabs: the artifact it delivers, then the plan, which most Files work doesn't need. */
export function FilesTaskTabs({ shown, artifactLabel, planLabel, onShow }: {
  shown: FilesTaskTab
  artifactLabel: string
  planLabel: string
  onShow: (tab: FilesTaskTab) => void
}) {
  const tabs: { tab: FilesTaskTab; name: string; label: string; id: string; panel: string }[] = [
    { tab: 'artifact', name: 'Artifact', label: artifactLabel, id: ARTIFACT_TAB_ID, panel: ARTIFACT_PANEL_ID },
    { tab: 'plan', name: 'Plan', label: planLabel, id: stepTabId('planning'), panel: stepPanelId('planning') },
  ]
  return (
    <div role="tablist" aria-label="Artifacts" className="flex flex-wrap gap-x-6 gap-y-2" onKeyDown={onTabListKeyDown}>
      {tabs.map(({ tab, name, label, id, panel }) => {
        const isShown = tab === shown
        return (
          <button
            key={tab}
            type="button"
            role="tab"
            id={id}
            aria-controls={panel}
            aria-selected={isShown}
            tabIndex={isShown ? 0 : -1}
            onClick={() => onShow(tab)}
            className={clsx(
              'border-b-2 pb-2 text-left leading-tight focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-8)]',
              isShown ? 'border-[var(--accent-9)]' : 'border-transparent hover:border-[var(--gray-6)]'
            )}
          >
            <span className="block text-sm font-semibold text-[var(--gray-12)]">{name}</span>
            <span className="block text-xs text-[var(--gray-10)]">{label}</span>
          </button>
        )
      })}
    </div>
  )
}

/** "Version 2 · Web page", or that none is made yet. */
export function artifactTabLabel(artifacts: ArtifactSummary[] | null): string {
  if (artifacts === null) return 'Loading…'
  const latest = artifacts[0]?.currentVersion
  if (!latest) return 'None yet'
  const more = artifacts.length > 1 ? ` · ${artifacts.length} artifacts` : ''
  return `Version ${latest.number} · ${formatLabel(latest.format)}${more}`
}

/** The task's artifact with its current version previewed, and the task's others to switch to. */
export function TaskArtifactView({ space, artifacts }: { space: { id: string; slug: string }; artifacts: ArtifactSummary[] | null }) {
  const [chosenId, setChosenId] = useState<string | null>(null)
  const artifact = artifacts?.find((candidate) => candidate.id === chosenId) ?? artifacts?.[0] ?? null
  const version = artifact?.currentVersion ?? null

  const panel = (children: React.ReactNode) => (
    <div role="tabpanel" id={ARTIFACT_PANEL_ID} aria-labelledby={ARTIFACT_TAB_ID} className="space-y-4">
      {children}
    </div>
  )

  if (artifacts === null) return panel(<p className="text-sm text-[var(--gray-10)]">Loading the task's artifacts…</p>)
  if (!artifact) {
    return panel(
      <div className="space-y-1 py-6 text-center text-sm">
        <p className="font-medium text-[var(--gray-12)]">No artifact yet</p>
        <p className="text-[var(--gray-10)]">
          What the agent makes for this task shows here. Choose Create artifact under the thread, or ask for it in a message.
        </p>
      </div>
    )
  }

  const download = () => {
    if (!version) return
    void downloadArtifactVersion(space.id, artifact.id, version.id, version.entrypoint.split('/').pop() ?? artifact.title).catch(
      (error: unknown) => toast.error(error instanceof Error ? error.message : "Couldn't download the artifact")
    )
  }

  return panel(
    <>
      {artifacts.length > 1 && (
        <Select aria-label="Artifact" value={artifact.id} onChange={setChosenId}>
          {artifacts.map((candidate) => (
            <option key={candidate.id} value={candidate.id}>
              {candidate.title}
            </option>
          ))}
        </Select>
      )}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-base font-semibold text-[var(--gray-12)]">{artifact.title}</h3>
          <p className="text-xs text-[var(--gray-10)]">
            {version
              ? `Version ${version.number} of ${artifact.versionCount} · ${formatLabel(version.format)} · ${formatTimestamp(version.createdAt)}`
              : 'No version is kept.'}
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button outline size="small" href={artifactPath(space.slug, artifact.id)}>
            Open
          </Button>
          {version?.status === 'available' && (
            <Button outline size="small" onClick={download}>
              Download
            </Button>
          )}
        </div>
      </div>
      {version && (
        <ArtifactPreviewView
          key={version.id}
          projectId={space.id}
          artifactId={artifact.id}
          versionId={version.id}
          title={artifact.title}
          currentVersionHref={null}
          onDownload={download}
        />
      )}
    </>
  )
}
