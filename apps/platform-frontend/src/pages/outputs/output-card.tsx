import { Link } from '@/components/link'
import { Timestamp } from '@/components/timestamp'
import { DrawingPinFilledIcon, DrawingPinIcon, Link2Icon, OpenInNewWindowIcon } from '@radix-ui/react-icons'
import clsx from 'clsx'
import type { OutputItem } from '@viberglass/types'
import { toast } from 'sonner'
import { OutputCover } from './output-cover'
import { outputHref, outputLabel, outputReason, outputTitle } from './output-text'

/** Opening in a new tab or window keeps the browser's own behaviour; a plain click opens quick look. */
function wantsBrowserLink(event: React.MouseEvent): boolean {
  return event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0
}

async function copyLink(href: string) {
  try {
    await navigator.clipboard.writeText(new URL(href, window.location.origin).toString())
    toast.success('Link copied')
  } catch {
    toast.error("Couldn't copy the link")
  }
}

/** `pinned` is null for what can't be pinned. */
export function OutputCard({
  item,
  onQuickLook,
  pinned,
  onTogglePin,
  showSpace = true,
}: {
  item: OutputItem
  onQuickLook: () => void
  pinned: boolean | null
  onTogglePin: () => void
  /** Off inside a space, where every card is in it. */
  showSpace?: boolean
}) {
  const href = outputHref(item)
  const title = outputTitle(item)
  return (
    <article className="group relative">
      <Link
        href={href}
        onClick={(event) => {
          if (wantsBrowserLink(event)) return
          event.preventDefault()
          onQuickLook()
        }}
        className="block rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--accent-9)]"
      >
        <div
          className={clsx(
            'rounded-md transition-[transform,box-shadow] duration-200 ease-out group-hover:-translate-y-0.5 group-hover:shadow-[0_12px_24px_-12px_rgb(28_25_23/0.3)] motion-reduce:transition-none motion-reduce:group-hover:translate-y-0',
            pinned && 'outline-2 outline-offset-2 outline-[var(--accent-9)]'
          )}
        >
          <OutputCover item={item} />
        </div>
        <h3 className="mt-3 truncate font-sans text-[15px] leading-5 font-semibold tracking-normal text-[var(--gray-12)]">{title}</h3>
      </Link>
      <p className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[13px] leading-5 text-[var(--gray-10)]">
        <span className="font-mono text-xs text-[var(--gray-11)]">{outputLabel(item)}</span>
        {showSpace && (
          <>
            <span aria-hidden>·</span>
            <span className="truncate">{item.spaceName}</span>
          </>
        )}
        <span aria-hidden>·</span>
        <Timestamp date={item.createdAt} className="shrink-0" />
      </p>
      <p className="mt-0.5 truncate text-xs leading-4 text-[var(--gray-9)]">{outputReason(item)}</p>
      {pinned && (
        <span aria-hidden className="pointer-events-none absolute top-2 right-2 z-[1] grid size-5 place-items-center rounded-[4px] bg-[var(--accent-9)] text-[var(--accent-contrast)] group-focus-within:opacity-0 group-hover:opacity-0">
          <DrawingPinFilledIcon className="size-3" />
        </span>
      )}
      <div className="absolute top-2 right-2 z-[2] flex gap-0.5 rounded-[5px] bg-[var(--color-panel-solid)] p-0.5 opacity-0 shadow-[0_0_0_1px_var(--gray-5),0_2px_6px_rgb(28_25_23/0.1)] transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100">
        {pinned !== null && (
          <button
            type="button"
            aria-pressed={pinned}
            aria-label={pinned ? `Unpin ${title} from Home` : `Pin ${title} to Home`}
            title={pinned ? 'Unpin from Home' : 'Pin to Home'}
            onClick={onTogglePin}
            className="grid size-7 place-items-center rounded-[3px] text-[var(--gray-11)] hover:bg-[var(--gray-3)] focus-visible:outline-2 focus-visible:outline-[var(--accent-9)]"
          >
            {pinned ? <DrawingPinFilledIcon className="text-[var(--accent-10)]" /> : <DrawingPinIcon />}
          </button>
        )}
        <Link
          href={href}
          aria-label={`Open ${title}`}
          title="Open"
          className="grid size-7 place-items-center rounded-[3px] text-[var(--gray-11)] hover:bg-[var(--gray-3)] focus-visible:outline-2 focus-visible:outline-[var(--accent-9)]"
        >
          <OpenInNewWindowIcon />
        </Link>
        <button
          type="button"
          aria-label={`Copy a link to ${title}`}
          title="Copy link"
          onClick={() => void copyLink(href)}
          className="grid size-7 place-items-center rounded-[3px] text-[var(--gray-11)] hover:bg-[var(--gray-3)] focus-visible:outline-2 focus-visible:outline-[var(--accent-9)]"
        >
          <Link2Icon />
        </button>
      </div>
    </article>
  )
}
