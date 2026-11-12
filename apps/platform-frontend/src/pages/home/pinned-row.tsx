import { AppCover, type CoverStatusTone } from '@/components/covers/app-cover'
import { ArtifactCover } from '@/components/covers/artifact-cover'
import { CoverFrame } from '@/components/covers/cover-frame'
import { Link } from '@/components/link'
import { Cross2Icon, ExternalLinkIcon } from '@radix-ui/react-icons'
import type { OutputReleaseStatus, Pin } from '@viberglass/types'
import clsx from 'clsx'
import { useState } from 'react'

const SHOWN = 6

const RELEASE: Record<OutputReleaseStatus, { label: string; tone: CoverStatusTone }> = {
  live: { label: 'Live', tone: 'live' },
  building: { label: 'Building', tone: 'working' },
  failed: { label: 'Build failed', tone: 'failed' },
  rolled_back: { label: 'Rolled back', tone: 'idle' },
  was_live: { label: 'Off', tone: 'idle' },
  ready: { label: 'Not live yet', tone: 'idle' },
}

/** Moves the pin at `from` to sit before the pin at `to` (or last, for `to === pins.length`). */
export function movePin(pins: Pin[], from: number, to: number): Pin[] {
  const moved = pins[from]
  if (!moved || to < 0 || to > pins.length || to === from || to === from + 1) return pins
  const rest = pins.filter((_, index) => index !== from)
  rest.splice(to > from ? to - 1 : to, 0, moved)
  return rest
}

/** What the person pinned, first on Home: each opens in one click, and they're put in order by dragging. */
export function PinnedRow({ pins, onUnpin, onReorder }: { pins: Pin[]; onUnpin: (pin: Pin) => void; onReorder: (pins: Pin[]) => void }) {
  const [expanded, setExpanded] = useState(false)
  const [dragging, setDragging] = useState<number | null>(null)
  const [dropAt, setDropAt] = useState<number | null>(null)
  const [announcement, setAnnouncement] = useState('')
  const shown = expanded ? pins : pins.slice(0, SHOWN)

  const move = (from: number, to: number) => {
    const next = movePin(pins, from, to)
    if (next === pins) return
    onReorder(next)
    setAnnouncement(`${pins[from].title} moved to position ${next.indexOf(pins[from]) + 1} of ${pins.length}`)
  }

  return (
    <section aria-labelledby="home-pinned" className="mb-9">
      <div className="mb-3 flex items-baseline gap-2">
        <h2 id="home-pinned" className="font-sans text-base font-semibold tracking-normal">
          Pinned
        </h2>
        {pins.length > 0 && <span className="rounded bg-[var(--gray-3)] px-1.5 text-xs font-medium text-[var(--gray-11)]">{pins.length}</span>}
        {pins.length > 1 && <span className="text-[13px] text-[var(--gray-9)]">Drag to reorder</span>}
        {pins.length > SHOWN && (
          <button type="button" onClick={() => setExpanded((value) => !value)} className="ml-auto text-[13px] text-[var(--gray-11)] underline underline-offset-3">
            {expanded ? 'Show fewer' : `Show all ${pins.length}`}
          </button>
        )}
      </div>
      {pins.length === 0 ? (
        <p className="rounded-md border border-dashed border-[var(--gray-6)] px-4 py-3 text-sm text-[var(--gray-10)]">
          Pin the decks, documents and apps you check often, from{' '}
          <Link href="/outputs" className="text-[var(--gray-12)] underline underline-offset-3">
            Outputs
          </Link>{' '}
          or their own page, and they'll wait for you here.
        </p>
      ) : (
        <ul className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
          {shown.map((pin, index) => (
            <li
              key={pin.id}
              draggable
              onDragStart={(event) => {
                setDragging(index)
                event.dataTransfer.effectAllowed = 'move'
              }}
              onDragOver={(event) => {
                if (dragging === null) return
                event.preventDefault()
                const box = event.currentTarget.getBoundingClientRect()
                setDropAt(event.clientX < box.left + box.width / 2 ? index : index + 1)
              }}
              onDrop={(event) => {
                event.preventDefault()
                if (dragging !== null && dropAt !== null) move(dragging, dropAt)
                setDragging(null)
                setDropAt(null)
              }}
              onDragEnd={() => {
                setDragging(null)
                setDropAt(null)
              }}
              onKeyDown={(event) => {
                if (!event.altKey || (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight')) return
                event.preventDefault()
                move(index, event.key === 'ArrowLeft' ? index - 1 : index + 2)
              }}
              className={clsx(
                'group relative cursor-grab active:cursor-grabbing',
                dragging === index && 'opacity-40',
                dropAt === index && dragging !== index && 'before:absolute before:inset-y-0 before:-left-3 before:w-0.5 before:rounded-full before:bg-[var(--gray-12)]',
                dropAt === index + 1 && index === shown.length - 1 && 'after:absolute after:inset-y-0 after:-right-3 after:w-0.5 after:rounded-full after:bg-[var(--gray-12)]'
              )}
            >
              <PinTile pin={pin} />
              <button
                type="button"
                aria-label={`Unpin ${pin.title}`}
                title="Unpin"
                onClick={() => onUnpin(pin)}
                className="absolute top-1.5 right-1.5 z-[2] grid size-6 place-items-center rounded-[4px] bg-[var(--color-panel-solid)] text-[var(--gray-11)] opacity-0 shadow-[0_0_0_1px_var(--gray-5)] transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 hover:text-[var(--gray-12)] [@media(hover:none)]:opacity-100"
              >
                <Cross2Icon />
              </button>
            </li>
          ))}
        </ul>
      )}
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </section>
  )
}

function PinTile({ pin }: { pin: Pin }) {
  if (!pin.available) {
    return (
      <div>
        <CoverFrame className="grid place-items-center bg-[var(--gray-2)] text-xs text-[var(--gray-9)]">No longer available</CoverFrame>
        <p className="mt-2.5 truncate text-sm font-semibold text-[var(--gray-9)]">{pin.title}</p>
        <p className="mt-0.5 text-xs text-[var(--gray-9)]">You can no longer open it.</p>
      </div>
    )
  }
  if (pin.kind === 'app') {
    const opensApp = pin.running && pin.appUrl
    const status = opensApp ? RELEASE.live : pin.release?.status === 'live' ? { label: 'Off', tone: 'idle' as const } : pin.release ? RELEASE[pin.release.status] : { label: 'No release yet', tone: 'idle' as const }
    return (
      <Link
        href={opensApp ? (pin.appUrl ?? '') : `/spaces/${pin.spaceSlug}/app`}
        target={opensApp ? '_blank' : undefined}
        rel={opensApp ? 'noopener' : undefined}
        draggable={false}
        className="block rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--accent-9)]"
      >
        <AppCover name={pin.title} seed={pin.target.kind === 'app' ? pin.target.spaceId : pin.id} status={status} />
        <p className="mt-2.5 truncate text-sm font-semibold text-[var(--gray-12)]">{pin.title}</p>
        <p className="mt-0.5 flex items-center gap-1 text-xs text-[var(--gray-10)]">
          {opensApp ? (
            <>
              Open app <ExternalLinkIcon className="size-3" />
            </>
          ) : (
            'Releases'
          )}
        </p>
      </Link>
    )
  }
  return (
    <Link
      href={`/spaces/${pin.spaceSlug}/artifacts/${pin.target.kind === 'artifact' ? pin.target.artifactId : ''}`}
      draggable={false}
      className="block rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--accent-9)]"
    >
      <ArtifactCover title={pin.title} format={pin.current?.format ?? 'other'} cover={pin.current?.cover ?? null} imageUrl={pin.imageUrl} />
      <p className="mt-2.5 flex items-center gap-1.5 truncate text-sm font-semibold text-[var(--gray-12)]">
        {pin.hasNewVersion && <span aria-label="New version" className="size-1.5 shrink-0 rounded-full bg-[var(--accent-9)] shadow-[0_0_0_2px_var(--accent-3)]" />}
        <span className="truncate">{pin.title}</span>
      </p>
      <p className="mt-0.5 truncate text-xs text-[var(--gray-10)]">
        {pin.current && <span className="font-mono text-[var(--gray-11)]">v{pin.current.number}</span>}
        {pin.hasNewVersion ? ' new' : ''} · {pin.spaceName}
      </p>
    </Link>
  )
}
