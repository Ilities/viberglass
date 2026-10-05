import clsx from 'clsx'
import type { RootContent } from 'mdast'
import { useMemo, type ReactNode } from 'react'
import { parseMarkdown, textOffset } from './parseMarkdown'

/** A comment's stretch of the source, shown highlighted. */
export interface DocumentHighlight {
  id: string
  start: number
  end: number
}

interface RenderContext {
  source: string
  highlights: DocumentHighlight[]
  activeId: string | null
  onHighlightClick?: (id: string, element: HTMLElement) => void
  reading: boolean
}

/** Heading sizes by depth; reading full screen they grow with the body text. */
const HEADING_SIZE = {
  normal: ['text-xl', 'text-lg', 'text-base'],
  reading: ['text-[30px] leading-tight tracking-[-0.02em]', 'text-[23px] leading-snug', 'text-[19px]'],
} as const

const SAFE_HREF = /^(https?:|mailto:|\/|#)/i

/**
 * One run of text, split where highlights start and end. Every piece carries
 * its source offsets (`data-src-start`/`data-src-end`), which is how a
 * selection in the rendered document is mapped back to the markdown.
 */
function TextRun({ value, node, context }: { value: string; node: RootContent; context: RenderContext }) {
  const exactStart = textOffset(context.source, node, value)
  const nodeStart = node.position?.start.offset ?? 0
  const nodeEnd = node.position?.end.offset ?? nodeStart
  const start = exactStart ?? nodeStart
  const end = exactStart === null ? nodeEnd : exactStart + value.length

  const cuts = [start, end]
  for (const highlight of context.highlights) {
    if (exactStart === null) continue
    if (highlight.start > start && highlight.start < end) cuts.push(highlight.start)
    if (highlight.end > start && highlight.end < end) cuts.push(highlight.end)
  }
  const sorted = [...new Set(cuts)].sort((a, b) => a - b)

  return (
    <>
      {sorted.slice(0, -1).map((from, index) => {
        const to = sorted[index + 1]
        const text = exactStart === null ? value : value.slice(from - start, to - start)
        const ids = context.highlights.filter((highlight) => highlight.start < to && highlight.end > from).map((highlight) => highlight.id)
        const position = { 'data-src-start': from, 'data-src-end': to, 'data-src-approx': exactStart === null ? '' : undefined }
        if (ids.length === 0) return <span key={from} {...position}>{text}</span>
        const active = context.activeId !== null && ids.includes(context.activeId)
        return (
          <mark
            key={from}
            {...position}
            data-comment-ids={ids.join(' ')}
            onClick={(event) => context.onHighlightClick?.(ids[0], event.currentTarget)}
            className={clsx('cursor-pointer rounded-sm text-inherit', active ? 'bg-amber-300/70 dark:bg-amber-500/50' : 'bg-amber-200/60 dark:bg-amber-500/25')}
          >
            {text}
          </mark>
        )
      })}
    </>
  )
}

function renderChildren(nodes: RootContent[], context: RenderContext): ReactNode[] {
  return nodes.map((child, index) => renderNode(child, index, context))
}

function renderNode(node: RootContent, key: number, context: RenderContext): ReactNode {
  switch (node.type) {
    case 'text':
    case 'html':
      return <TextRun key={key} value={node.value} node={node} context={context} />
    case 'inlineCode':
      return (
        <code key={key} className="rounded bg-[var(--gray-3)] px-1 font-mono text-[0.9em]">
          <TextRun value={node.value} node={node} context={context} />
        </code>
      )
    case 'strong':
      return <strong key={key}>{renderChildren(node.children, context)}</strong>
    case 'emphasis':
      return <em key={key}>{renderChildren(node.children, context)}</em>
    case 'delete':
      return <del key={key}>{renderChildren(node.children, context)}</del>
    case 'break':
      return <br key={key} />
    case 'link':
      return SAFE_HREF.test(node.url) ? (
        <a key={key} href={node.url} target="_blank" rel="noreferrer noopener" className="text-[var(--accent-11)] underline underline-offset-2">
          {renderChildren(node.children, context)}
        </a>
      ) : (
        <span key={key}>{renderChildren(node.children, context)}</span>
      )
    case 'image':
      return <span key={key} className="text-[var(--gray-10)]">[{node.alt || 'image'}]</span>
    case 'heading': {
      const size = HEADING_SIZE[context.reading ? 'reading' : 'normal'][Math.min(node.depth, 3) - 1]
      const Tag = node.depth === 1 ? 'h3' : node.depth === 2 ? 'h4' : 'h5'
      return (
        <Tag key={key} className={`${size} ${context.reading ? 'mt-10' : 'mt-6'} font-semibold text-[var(--gray-12)] first:mt-0`}>
          {renderChildren(node.children, context)}
        </Tag>
      )
    }
    case 'paragraph':
      return <p key={key}>{renderChildren(node.children, context)}</p>
    case 'list': {
      const Tag = node.ordered ? 'ol' : 'ul'
      return (
        <Tag key={key} start={node.ordered && node.start ? node.start : undefined} className={clsx('space-y-1 pl-6', node.ordered ? 'list-decimal' : 'list-disc')}>
          {renderChildren(node.children, context)}
        </Tag>
      )
    }
    case 'listItem':
      return (
        <li key={key} className={clsx(node.checked !== null && node.checked !== undefined && 'list-none', '[&>p]:my-0')}>
          {node.checked !== null && node.checked !== undefined && <input type="checkbox" checked={node.checked} readOnly disabled className="mr-2 -ml-5 align-middle" />}
          {renderChildren(node.children, context)}
        </li>
      )
    case 'blockquote':
      return (
        <blockquote key={key} className="space-y-3 border-l-4 border-[var(--gray-6)] pl-4 text-[var(--gray-11)]">
          {renderChildren(node.children, context)}
        </blockquote>
      )
    case 'code':
      return (
        <pre key={key} className="overflow-x-auto rounded-lg bg-[var(--gray-3)] p-4 font-mono text-[13px] leading-6">
          <code>
            <TextRun value={node.value} node={node} context={context} />
          </code>
        </pre>
      )
    case 'thematicBreak':
      return <hr key={key} className="border-[var(--gray-6)]" />
    case 'table':
      return (
        <div key={key} className="overflow-x-auto">
          <table className="min-w-full border-collapse text-sm">
            <tbody>
              {node.children.map((row, rowIndex) => (
                <tr key={rowIndex} className="border-b border-[var(--gray-5)]">
                  {row.children.map((cell, cellIndex) => {
                    const Cell = rowIndex === 0 ? 'th' : 'td'
                    return (
                      <Cell key={cellIndex} className={clsx('px-3 py-1.5 text-left align-top', rowIndex === 0 && 'font-semibold')} style={{ textAlign: node.align?.[cellIndex] ?? undefined }}>
                        {renderChildren(cell.children, context)}
                      </Cell>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
    case 'footnoteDefinition':
      return (
        <div key={key} className="text-sm text-[var(--gray-10)]">
          {renderChildren(node.children, context)}
        </div>
      )
    case 'footnoteReference':
      return <sup key={key}>{node.label ?? node.identifier}</sup>
    default:
      // Definitions, link references and front matter carry nothing to read.
      return null
  }
}

interface MarkdownDocumentProps {
  source: string
  highlights?: DocumentHighlight[]
  activeHighlightId?: string | null
  onHighlightClick?: (id: string, element: HTMLElement) => void
  /** Larger type and line height, for reading it full screen. */
  reading?: boolean
}

/** A research or plan document, rendered from its markdown, with comments' text highlighted. */
export function MarkdownDocument({ source, highlights = [], activeHighlightId = null, onHighlightClick, reading = false }: MarkdownDocumentProps) {
  const tree = useMemo(() => parseMarkdown(source), [source])
  const context: RenderContext = { source, highlights, activeId: activeHighlightId, onHighlightClick, reading }
  return (
    <div className={reading ? 'space-y-4 text-[18px] leading-8 text-[var(--gray-12)]' : 'space-y-3 text-[15px] leading-7 text-[var(--gray-12)]'}>
      {renderChildren(tree.children, context)}
    </div>
  )
}
