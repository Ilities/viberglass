import type { ArtifactCover as CoverFacts, ArtifactFormat } from '@viberglass/types'
import clsx from 'clsx'
import { useState } from 'react'
import { formatLabel } from '@/lib/artifacts'
import { CoverFrame } from './cover-frame'

/** A version's cover, drawn from what was read from its entry file when it was saved. */
export function ArtifactCover({
  title,
  format,
  cover,
  imageUrl,
  expired = false,
  size = 'card',
}: {
  title: string
  format: ArtifactFormat
  cover: CoverFacts | null
  imageUrl?: string | null
  expired?: boolean
  size?: 'card' | 'thumb'
}) {
  return (
    <CoverFrame className={clsx(expired && 'opacity-55 grayscale')}>
      <CoverArt title={title} format={format} cover={cover} imageUrl={imageUrl ?? null} size={size} />
      {expired && size === 'card' && <CoverTag className="right-2 left-auto">No longer kept</CoverTag>}
    </CoverFrame>
  )
}

function CoverArt({ title, format, cover, imageUrl, size }: { title: string; format: ArtifactFormat; cover: CoverFacts | null; imageUrl: string | null; size: 'card' | 'thumb' }) {
  if ((format === 'image' || format === 'svg') && imageUrl) {
    return (
      <div className="absolute inset-0 grid place-items-center bg-[var(--gray-2)] p-3">
        <img src={imageUrl} alt="" loading="lazy" referrerPolicy="no-referrer" className="max-h-full max-w-full object-contain" />
      </div>
    )
  }
  if (cover?.kind === 'deck') return <DeckCover title={title} slides={cover.slides} slideCount={cover.slideCount} size={size} />
  if (cover?.kind === 'page') return <PageCover heading={cover.heading ?? title} excerpt={cover.excerpt} size={size} />
  if (cover?.kind === 'table') return <TableCover columns={cover.columns} rows={cover.rows} />
  if (cover?.kind === 'keys') return <KeysCover keys={cover.keys} />
  if (format === 'pdf') return <PdfCover title={title} size={size} />
  return <PlainCover title={title} format={formatLabel(format)} size={size} />
}

const MAX_TICKS = 24

/** Moving across the cover steps through the slides' titles, the way a deck is flipped through. */
function DeckCover({ title, slides, slideCount, size }: { title: string; slides: string[]; slideCount: number; size: 'card' | 'thumb' }) {
  const [index, setIndex] = useState(0)
  const count = Math.max(slideCount, slides.length, 1)
  const ticks = Math.min(count, MAX_TICKS)
  // Only slides whose titles were read can be flipped through; a deck its script draws shows its first.
  const scrubbable = size === 'card' && slides.length > 1
  const scrub = (event: React.PointerEvent<HTMLDivElement>) => {
    const box = event.currentTarget.getBoundingClientRect()
    setIndex(Math.min(slides.length - 1, Math.max(0, Math.floor(((event.clientX - box.left) / box.width) * slides.length))))
  }
  return (
    <div
      className="absolute inset-0 flex flex-col bg-[#1B2440] px-4 pt-3 pb-4 text-white"
      onPointerMove={scrubbable ? scrub : undefined}
      onPointerLeave={() => setIndex(0)}
    >
      {size === 'card' && (
        <span className="font-mono text-[10px] text-white/55 tabular-nums">
          {slideCount > 0 ? `${index + 1} / ${slideCount}` : 'Slides'}
        </span>
      )}
      <p className={clsx('mt-auto line-clamp-2 font-display font-bold tracking-[-0.02em] text-balance', size === 'card' ? 'text-lg leading-[1.2]' : 'text-[9px] leading-tight')}>
        {slides[index] || (index === 0 ? title : '')}
      </p>
      {size === 'card' && (
        <div className="absolute inset-x-4 bottom-3 flex gap-[3px]" aria-hidden>
          {Array.from({ length: ticks }, (_, tick) => (
            <i key={tick} className={clsx('h-0.5 flex-1 rounded-full', tick === Math.floor((index / count) * ticks) ? 'bg-white' : 'bg-white/30')} />
          ))}
        </div>
      )}
    </div>
  )
}

function PageCover({ heading, excerpt, size }: { heading: string; excerpt: string; size: 'card' | 'thumb' }) {
  return (
    <div className="absolute inset-0 bg-[var(--gray-3)]">
      <div
        className={clsx(
          'absolute inset-x-[14%] top-[10%] bottom-0 bg-[var(--color-panel-solid)] shadow-[0_0_0_1px_var(--gray-5)]',
          size === 'card' ? 'px-4 pt-3.5' : 'px-1.5 pt-1.5'
        )}
        style={{ maskImage: 'linear-gradient(to bottom, black 70%, transparent)' }}
      >
        <p className={clsx('line-clamp-2 font-display font-bold text-[var(--gray-12)]', size === 'card' ? 'text-[13px] leading-4' : 'text-[6px] leading-[7px]')}>{heading}</p>
        {size === 'card' && <p className="mt-1.5 text-[9.5px] leading-[13px] text-[var(--gray-11)]">{excerpt}</p>}
      </div>
    </div>
  )
}

const NUMERIC = /^[-+]?[\d\s.,]+[%€$£]?$/

function TableCover({ columns, rows }: { columns: string[]; rows: string[][] }) {
  return (
    <div className="absolute inset-0 overflow-hidden bg-[var(--color-panel-solid)] px-3.5 pt-2.5">
      <table className="w-full table-fixed border-collapse font-mono text-[10.5px] leading-[21px] text-[var(--gray-11)] tabular-nums">
        <thead>
          <tr>
            {columns.map((column, index) => (
              <th key={index} className="truncate border-b-[1.5px] border-[var(--grass-9)] text-left font-medium text-[var(--gray-12)]">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {columns.map((_, index) => (
                <td key={index} className={clsx('truncate border-b border-[var(--gray-4)] pr-2', NUMERIC.test(row[index] ?? '') && 'text-right')}>
                  {row[index] ?? ''}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function KeysCover({ keys }: { keys: string[] }) {
  return (
    <div className="absolute inset-0 bg-[var(--color-panel-solid)] px-4 pt-3 font-mono text-[11px] leading-[17px] text-[var(--gray-10)]">
      <span>{'{'}</span>
      {keys.map((key) => (
        <div key={key} className="truncate pl-4">
          <span className="text-[var(--grass-11)]">"{key}"</span>: …
        </div>
      ))}
    </div>
  )
}

function PdfCover({ title, size }: { title: string; size: 'card' | 'thumb' }) {
  return (
    <div className="absolute inset-0 bg-[var(--gray-3)]">
      {size === 'card' && <CoverTag>PDF</CoverTag>}
      <div
        className="absolute top-[10%] bottom-[-6%] left-1/2 aspect-[3/4] -translate-x-1/2 bg-[var(--color-panel-solid)] px-[8%] pt-[9%] shadow-[0_0_0_1px_var(--gray-6)]"
        style={{ clipPath: 'polygon(0 0, 84% 0, 100% 11%, 100% 100%, 0 100%)' }}
      >
        <p className={clsx('line-clamp-3 font-display font-bold text-[var(--gray-12)]', size === 'card' ? 'text-[10px] leading-3' : 'text-[5px] leading-[6px]')}>{title}</p>
      </div>
    </div>
  )
}

function PlainCover({ title, format, size }: { title: string; format: string; size: 'card' | 'thumb' }) {
  return (
    <div className="absolute inset-0 flex flex-col justify-end bg-[var(--gray-3)] p-4">
      {size === 'card' && <CoverTag>{format}</CoverTag>}
      <p className={clsx('line-clamp-2 font-display font-bold text-[var(--gray-12)]', size === 'card' ? 'text-base leading-5' : 'text-[8px] leading-[9px]')}>{title}</p>
    </div>
  )
}

export function CoverTag({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={clsx('absolute top-2 left-2 z-[1] rounded-sm bg-[var(--color-panel-solid)] px-1.5 font-mono text-[10px] leading-[18px] text-[var(--gray-11)] shadow-[0_0_0_1px_var(--gray-5)]', className)}>
      {children}
    </span>
  )
}
