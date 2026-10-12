import { Button } from '@/components/button'
import { MarkdownDocument } from '@/pages/project/tickets/markdown/markdown-document'
import { getArtifactPreview } from '@/service/api/artifact-api'
import type { ArtifactPreview } from '@viberglass/types'
import { useCallback, useEffect, useRef, useState } from 'react'

/** How long before a frame's address expires it is fetched again, so a long look never hits a dead link. */
const RENEW_BEFORE_MS = 60_000

/**
 * One version's preview. Text is rendered here; web pages, presentations,
 * images and PDFs load in a sandboxed frame from the separate preview
 * address, which has no access to the app or the person's sign-in.
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
  const frame = useRef<HTMLIFrameElement>(null)

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

  return (
    <div>
      <div className="mb-2 flex justify-end">
        <Button outline size="small" onClick={() => void frame.current?.requestFullscreen?.()}>
          Full screen
        </Button>
      </div>
      <div className="relative aspect-video w-full overflow-hidden rounded-md border border-[var(--gray-5)] bg-white">
        <iframe
          ref={frame}
          key={preview.url}
          src={preview.url}
          title={`Preview of ${title}`}
          sandbox="allow-scripts"
          allow="fullscreen"
          allowFullScreen
          referrerPolicy="no-referrer"
          className="absolute inset-0 size-full"
          onError={() => {
            // One fresh address, in case this one expired while the page was open.
            if (retried.current) return
            retried.current = true
            void load()
          }}
        />
      </div>
    </div>
  )
}
