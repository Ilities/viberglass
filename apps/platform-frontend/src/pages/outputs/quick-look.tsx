import { Button } from '@/components/button'
import { Dialog, DialogDescription, DialogTitle } from '@/components/dialog'
import { PinButton } from '@/components/pin-button'
import { Timestamp } from '@/components/timestamp'
import { taskPath } from '@/lib/taskPath'
import { ArtifactPreviewView } from '@/pages/project/artifacts/artifact-preview'
import { downloadArtifactVersion } from '@/service/api/artifact-api'
import { ChevronLeftIcon, ChevronRightIcon } from '@radix-ui/react-icons'
import type { OutputItem } from '@viberglass/types'
import { toast } from 'sonner'
import { OutputCover } from './output-cover'
import { outputHref, outputLabel, outputReason, outputTitle } from './output-text'

/** One output, larger, without leaving the grid; arrow keys move through the list. */
export function QuickLook({
  items,
  index,
  onIndexChange,
  onClose,
  isPinned,
  onTogglePin,
}: {
  items: OutputItem[]
  index: number
  onIndexChange: (index: number) => void
  onClose: () => void
  isPinned: (item: OutputItem) => boolean | null
  onTogglePin: (item: OutputItem) => void
}) {
  const item = items[index]
  if (!item) return null
  const pinned = isPinned(item)
  const move = (step: number) => {
    const next = index + step
    if (next >= 0 && next < items.length) onIndexChange(next)
  }
  return (
    <Dialog open size="5xl" onClose={(open) => !open && onClose()}>
      <div
        onKeyDown={(event) => {
          if (event.key === 'ArrowRight') move(1)
          if (event.key === 'ArrowLeft') move(-1)
        }}
      >
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
          <div className="min-w-0">
            <DialogTitle className="truncate">{outputTitle(item)}</DialogTitle>
            <DialogDescription className="mt-1 flex flex-wrap items-center gap-1.5 text-sm text-[var(--gray-10)]">
              <span className="font-mono text-xs text-[var(--gray-11)]">{outputLabel(item)}</span>
              <span aria-hidden>·</span>
              {item.spaceName}
              <span aria-hidden>·</span>
              <Timestamp date={item.createdAt} />
              <span aria-hidden>·</span>
              {outputReason(item)}
            </DialogDescription>
          </div>
          <div className="flex items-center gap-2">
            <Actions item={item} />
            {pinned !== null && <PinButton pinned={pinned} onToggle={() => onTogglePin(item)} />}
            <Button outline aria-label="Previous" disabled={index === 0} onClick={() => move(-1)}>
              <ChevronLeftIcon />
            </Button>
            <Button outline aria-label="Next" disabled={index === items.length - 1} onClick={() => move(1)}>
              <ChevronRightIcon />
            </Button>
          </div>
        </div>
        <div className="mt-5">
          {item.type === 'artifact' ? (
            <ArtifactPreviewView
              key={item.versionId}
              projectId={item.spaceId}
              artifactId={item.artifactId}
              versionId={item.versionId}
              title={item.title}
              currentVersionHref={item.current ? null : `/spaces/${item.spaceSlug}/artifacts/${item.artifactId}`}
              onDownload={() => download(item)}
            />
          ) : (
            <div className="mx-auto max-w-xl">
              <OutputCover item={item} />
            </div>
          )}
        </div>
      </div>
    </Dialog>
  )
}

function download(item: Extract<OutputItem, { type: 'artifact' }>) {
  void downloadArtifactVersion(item.spaceId, item.artifactId, item.versionId, item.entrypoint.split('/').pop() ?? item.title).catch((error: unknown) =>
    toast.error(error instanceof Error ? error.message : "Couldn't download the artifact")
  )
}

function Actions({ item }: { item: OutputItem }) {
  if (item.type === 'artifact') {
    return (
      <>
        <Button color="brand" href={outputHref(item)}>Open</Button>
        {!item.expired && <Button outline onClick={() => download(item)}>Download</Button>}
      </>
    )
  }
  if (item.type === 'release') {
    return (
      <>
        {item.status === 'live' && item.appUrl ? (
          <Button color="brand" href={item.appUrl} target="_blank" rel="noopener">Open app</Button>
        ) : null}
        <Button outline href={outputHref(item)}>Releases</Button>
        {item.taskId && <Button outline href={taskPath(item.spaceSlug, { id: item.taskId, key: item.taskKey ?? undefined })}>Task</Button>}
      </>
    )
  }
  return <Button color="brand" href={outputHref(item)}>Try it on the task</Button>
}
