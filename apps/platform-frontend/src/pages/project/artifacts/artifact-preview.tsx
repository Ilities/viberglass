import { Button } from '@/components/button'
import { MarkdownDocument } from '@/pages/project/tickets/markdown/markdown-document'
import { getArtifactPreview } from '@/service/api/artifact-api'
import { cn } from '@/lib/utils'
import { Cross2Icon, EnterFullScreenIcon } from '@radix-ui/react-icons'
import type { ArtifactPreview } from '@viberglass/types'
import { useCallback, useEffect, useRef, useState } from 'react'

/** How long before a frame's address expires it is fetched again, so a long look never hits a dead link. */
const RENEW_BEFORE_MS = 60_000

/**
 * One version's preview. Text is rendered here; web pages, presentations,
 * images and PDFs load in a frame from the separate preview address, which
 * has no access to the app or the person's sign-in. The frame is sandboxed
 * except for PDFs, which browsers won't show in a sandbox.
 */
export function ArtifactPreviewView({
  projectId,
  artifactId,
  versionId,
  title,
  currentVersionHref,
  onDownload,
}: {
  projectId: string
  artifactId: string
  versionId: string
  title: string
  /** Where the artifact's current version is, for a version that's no longer kept. */
  currentVersionHref: string | null
  onDownload: () => void
}) {
  const [preview, setPreview] = useState<ArtifactPreview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const retried = useRef(false)
  const stage = useRef<HTMLDivElement>(null)
  const [fullScreen, setFullScreen] = useState(false)
  /** The frame's address that has finished loading, so a new one shows as loading again. */
  const [loadedUrl, setLoadedUrl] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setPreview(await getArtifactPreview(projectId, artifactId, versionId))
      setError(null)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Couldn't load the preview")
    }
  }, [projectId, artifactId, versionId])

  useEffect(() => {
    retried.current = false
    setPreview(null)
    void load()
  }, [load])

  // A frame's address is short-lived: fetch a new one before it runs out.
  const expiresAt = preview?.kind === 'frame' ? preview.expiresAt : null
  useEffect(() => {
    if (!expiresAt) return
    const wait = Math.max(new Date(expiresAt).getTime() - Date.now() - RENEW_BEFORE_MS, 5_000)
    const timer = setTimeout(() => void load(), wait)
    return () => clearTimeout(timer)
  }, [expiresAt, load])

  useEffect(() => {
    const changed = () => setFullScreen(document.fullscreenElement !== null && document.fullscreenElement === stage.current)
    document.addEventListener('fullscreenchange', changed)
    return () => document.removeEventListener('fullscreenchange', changed)
  }, [])

  if (error) {
    return (
      <div className="space-y-3 py-10 text-center text-sm">
        <p className="text-red-700 dark:text-red-400">{error}</p>
        <Button outline onClick={() => void load()}>
          Try again
        </Button>
      </div>
    )
  }
  if (!preview) return <p className="py-10 text-center text-sm text-[var(--gray-10)]">Loading the preview…</p>

  if (preview.kind === 'expired') {
    return (
      <div className="space-y-2 py-10 text-center text-sm text-[var(--gray-11)]">
        <p>This version is no longer kept. Older versions are removed as new ones are made.</p>
        {currentVersionHref && (
          <Button outline href={currentVersionHref}>
            See the current version
          </Button>
        )}
      </div>
    )
  }

  if (preview.kind === 'download') {
    return (
      <div className="space-y-3 py-10 text-center text-sm text-[var(--gray-11)]">
        <p>{preview.reason}</p>
        <Button outline onClick={onDownload}>
          Download
        </Button>
      </div>
    )
  }

  if (preview.kind === 'text') {
    return (
      <div>
        {preview.format === 'markdown' ? (
          <MarkdownDocument source={preview.content} />
        ) : (
          <pre className="overflow-x-auto rounded-md bg-[var(--gray-2)] p-4 text-xs leading-5 whitespace-pre-wrap text-[var(--gray-12)]">
            {preview.content}
          </pre>
        )}
        {preview.truncated && (
          <p className="mt-3 text-xs text-[var(--gray-10)]">The preview shows the start of the file. Download it to see all of it.</p>
        )}
      </div>
    )
  }

  // iPhone Safari has no full screen for anything but video; there the preview opens in a tab of its own,
  // where the preview address still sandboxes it.
  const openInTab = () => window.open(preview.url, '_blank', 'noopener')
  const enterFullScreen = () => {
    const box = stage.current
    if (document.fullscreenEnabled && box?.requestFullscreen) void box.requestFullscreen().catch(openInTab)
    else openInTab()
  }

  return (
    <div>
      <div className="mb-2 flex justify-end">
        <Button outline size="small" onClick={enterFullScreen}>
          <EnterFullScreenIcon aria-hidden />
          Full screen
        </Button>
      </div>
      <div
        ref={stage}
        className={cn('relative w-full overflow-hidden bg-white', !fullScreen && 'aspect-video rounded-md border border-[var(--gray-5)]')}
      >
        {loadedUrl !== preview.url && (
          <p role="status" className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-white text-sm text-[var(--gray-10)]">
            Loading the preview…
          </p>
        )}
        <iframe
          key={preview.url}
          src={preview.url}
          title={`Preview of ${title}`}
          sandbox={preview.format === 'pdf' ? undefined : 'allow-scripts'}
          allow="fullscreen"
          allowFullScreen
          referrerPolicy="no-referrer"
          className={cn('absolute inset-x-0 bottom-0 w-full', fullScreen ? 'top-11 h-[calc(100%-2.75rem)]' : 'top-0 h-full')}
          onLoad={() => setLoadedUrl(preview.url)}
          onError={() => {
            // One fresh address, in case this one expired while the page was open.
            if (retried.current) return
            retried.current = true
            void load()
          }}
        />
        {fullScreen && (
          <div className="absolute inset-x-0 top-0 z-20 flex h-11 items-center justify-between gap-3 border-b border-[var(--gray-5)] bg-[var(--color-panel-solid)] px-3">
            <p className="min-w-0 truncate text-sm font-medium text-[var(--gray-12)]">{title}</p>
            <Button outline size="small" onClick={() => void document.exitFullscreen().catch(() => undefined)} className="!h-8 shrink-0">
              <Cross2Icon aria-hidden />
              Exit full screen
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
