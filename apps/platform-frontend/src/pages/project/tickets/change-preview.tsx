import { Button } from '@/components/button'
import { ExternalLinkIcon } from '@radix-ui/react-icons'
import { getChangePreviews, tryChange, type AppPreview } from '@/service/api/build-api'
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'

const POLL_MS = 3000
// A preview that's on but still off is about to start.
const SETTLING: AppPreview['state'][] = ['off', 'building', 'starting', 'stopping']

/** The task's previews, read again every few seconds while one is building, starting or stopping. */
export function useChangePreviews(ticketId: string, enabled: boolean) {
  const [previews, setPreviews] = useState<AppPreview[]>([])
  const [polls, setPolls] = useState(0)

  const changed = useCallback((preview: AppPreview) => {
    setPreviews((current) => [...current.filter((p) => p.id !== preview.id), preview])
    setPolls((count) => count + 1)
  }, [])

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    getChangePreviews(ticketId)
      .then((listed) => !cancelled && setPreviews(listed))
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [ticketId, enabled, polls])

  const settling = previews.some((preview) => preview.power === 'on' && SETTLING.includes(preview.state))
  useEffect(() => {
    if (!enabled || !settling) return
    const timer = setTimeout(() => setPolls((count) => count + 1), POLL_MS)
    return () => clearTimeout(timer)
  }, [enabled, settling, previews])

  return { previews, changed }
}

/** What the preview of a change is doing, as the Preview fact says it. */
export function previewStatus(preview: AppPreview | null, headSha: string | null): string {
  if (!preview) return 'Not tried yet'
  const stale = headSha !== null && preview.commitSha !== headSha
  if (preview.power === 'off') return preview.state === 'stopping' ? 'Turning off' : 'Off'
  switch (preview.state) {
    case 'building':
      return 'Building'
    case 'off':
    case 'starting':
      return 'Starting'
    case 'stopping':
      return 'Turning off'
    case 'failed':
      return "Didn't start"
    case 'running':
      return stale ? 'Running an older version' : 'Running'
  }
}

/** A running preview's address, or null while it can't be opened. */
export function openablePreviewUrl(preview: AppPreview | null): string | null {
  if (!preview || preview.power !== 'on' || preview.state !== 'running') return null
  return preview.url
}

/** Open preview as a plain link, for whoever sees the change without a button that opens it. */
export function OpenPreviewLink({ url }: { url: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener"
      className="-my-1.5 inline-flex items-center gap-1 py-1.5 text-[var(--accent-11)] underline decoration-[var(--gray-7)] underline-offset-2 hover:decoration-current"
    >
      Open preview
      <ExternalLinkIcon className="size-3.5" />
    </a>
  )
}

/**
 * Try it, or Open preview once the change as the person sees it is running.
 * `primary` when it's the panel's main action.
 */
export function TryItButton({
  ticketId,
  pullRequestUrl,
  headSha,
  preview,
  primary,
  onChanged,
}: {
  ticketId: string
  pullRequestUrl: string
  headSha: string
  preview: AppPreview | null
  primary: boolean
  onChanged: (preview: AppPreview) => void
}) {
  const [sending, setSending] = useState(false)
  const current = preview !== null && preview.commitSha === headSha && preview.power === 'on'

  const tryIt = async () => {
    setSending(true)
    try {
      onChanged(await tryChange(ticketId, { pullRequestUrl, headSha }))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't start the preview")
    } finally {
      setSending(false)
    }
  }

  if (current && preview.state === 'running' && preview.url) {
    return primary ? (
      <Button color="brand" href={preview.url} target="_blank" rel="noopener">
        Open preview
      </Button>
    ) : (
      <Button outline href={preview.url} target="_blank" rel="noopener">
        Open preview
      </Button>
    )
  }
  if (current && (preview.state === 'off' || preview.state === 'building' || preview.state === 'starting')) {
    return (
      <Button outline disabled>
        {preview.state === 'building' ? 'Building the preview…' : 'Starting the preview…'}
      </Button>
    )
  }
  const label = sending ? 'Starting…' : preview && preview.commitSha !== headSha ? 'Try the latest' : preview?.state === 'failed' ? 'Try it again' : 'Try it'
  return primary ? (
    <Button color="brand" disabled={sending} onClick={() => void tryIt()}>
      {label}
    </Button>
  ) : (
    <Button outline disabled={sending} onClick={() => void tryIt()}>
      {label}
    </Button>
  )
}
