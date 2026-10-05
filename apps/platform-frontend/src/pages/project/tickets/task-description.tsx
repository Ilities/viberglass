import clsx from 'clsx'
import { useLayoutEffect, useRef, useState } from 'react'
import { MessageBody } from './message-body'

/** The original request stays above the thread, even when the conversation grows. */
export function TaskDescription({ description }: { description: string | null | undefined }) {
  const [expanded, setExpanded] = useState(false)
  const [overflows, setOverflows] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const element = ref.current
    if (!element || expanded) return
    const measure = () => setOverflows(element.scrollHeight > element.clientHeight + 1)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [description, expanded])

  if (!description?.trim()) return null

  return (
    <section aria-label="Task description" className="space-y-2 border-b border-[var(--gray-5)] pb-5">
      <h2 className="text-xs font-semibold text-[var(--gray-10)]">Description</h2>
      <div ref={ref} id="task-description" className={clsx('max-w-4xl leading-relaxed', !expanded && 'line-clamp-3')}>
        <MessageBody body={description.replace(/\\n/g, '\n')} />
      </div>
      {overflows && (
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls="task-description"
          onClick={() => setExpanded(!expanded)}
          className="text-xs text-[var(--gray-10)] hover:text-[var(--gray-12)]"
        >
          {expanded ? 'Show less' : 'Show more'}
        </button>
      )}
    </section>
  )
}
