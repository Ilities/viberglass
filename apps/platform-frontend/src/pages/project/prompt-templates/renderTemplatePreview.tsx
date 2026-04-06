import { Fragment } from 'react'

/**
 * Lightweight markdown-ish renderer for prompt template previews.
 * Handles ## headings, - list items, `code`, --- rules,
 * and highlights {{variables}} / {{#sections}}...{{/sections}}.
 */
export function renderTemplatePreview(text: string) {
  const lines = text.split('\n')
  const elements: React.ReactNode[] = []

  let inList = false
  let listItems: React.ReactNode[] = []

  function flushList() {
    if (listItems.length === 0) return
    elements.push(
      <ul key={`list-${elements.length}`} className="my-1.5 ml-4 list-disc space-y-0.5">
        {listItems}
      </ul>,
    )
    listItems = []
    inList = false
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // Horizontal rule
    if (/^-{3,}$/.test(line.trim())) {
      flushList()
      elements.push(
        <hr key={`hr-${i}`} className="my-2 border-zinc-200 dark:border-zinc-700" />,
      )
      continue
    }

    // ## Heading
    const headingMatch = line.match(/^(#{1,3})\s+(.+)/)
    if (headingMatch) {
      flushList()
      const level = headingMatch[1].length
      const Tag = level === 1 ? 'h3' : level === 2 ? 'h4' : 'h5'
      elements.push(
        <Tag key={`h-${i}`} className="mt-2 font-semibold text-zinc-800 dark:text-zinc-200">
          {renderInline(headingMatch[2])}
        </Tag>,
      )
      continue
    }

    // List item
    const listMatch = line.match(/^-\s+(.+)/)
    if (listMatch) {
      inList = true
      listItems.push(
        <li key={`li-${i}`} className="text-xs leading-5 text-zinc-700 dark:text-zinc-300">
          {renderInline(listMatch[1])}
        </li>,
      )
      continue
    }

    // Flush list if we hit a non-list line
    if (inList) {
      flushList()
    }

    // Numbered list (1) 2) etc.)
    const numMatch = line.match(/^(\d+[).])\s+(.+)/)
    if (numMatch) {
      elements.push(
        <div key={`num-${i}`} className="ml-4 text-xs leading-5 text-zinc-700 dark:text-zinc-300">
          <span className="font-medium">{numMatch[1]}</span> {renderInline(numMatch[2])}
        </div>,
      )
      continue
    }

    // Empty line
    if (line.trim() === '') {
      elements.push(<div key={`blank-${i}`} className="h-1.5" />)
      continue
    }

    // Regular paragraph
    elements.push(
      <p key={`p-${i}`} className="text-xs leading-5 text-zinc-700 dark:text-zinc-300">
        {renderInline(line)}
      </p>,
    )
  }

  flushList()

  return <Fragment>{elements}</Fragment>
}

/** Render inline elements: `code` and {{variables}} */
function renderInline(text: string): React.ReactNode[] {
  // Split on `code` and {{var}} patterns
  const parts = text.split(/(`[^`]+`|\{\{[#/]?[\w.]+\}\})/g)
  return parts.map((part, i) => {
    // Inline code
    if (/^`[^`]+`$/.test(part)) {
      return (
        <code
          key={i}
          className="rounded bg-zinc-200 px-1 py-0.5 font-mono text-[11px] text-zinc-800 dark:bg-zinc-700 dark:text-zinc-200"
        >
          {part.slice(1, -1)}
        </code>
      )
    }
    // Template variable
    if (/^\{\{[#/]?[\w.]+\}\}$/.test(part)) {
      return (
        <span
          key={i}
          className="rounded bg-violet-100 px-0.5 font-semibold text-violet-700 dark:bg-violet-500/20 dark:text-violet-300"
        >
          {part}
        </span>
      )
    }
    return <span key={i}>{part}</span>
  })
}
