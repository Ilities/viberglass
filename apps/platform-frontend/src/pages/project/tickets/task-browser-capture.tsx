import {
  browserCaptureOf,
  describeFailedRequest,
  describeUncaughtError,
  type TicketMetadata,
} from '@viberglass/types'
import { useState } from 'react'

function count(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`
}

function Entries({ title, lines }: { title: string; lines: string[] }) {
  if (lines.length === 0) return null
  return (
    <div className="space-y-1">
      <h3 className="text-xs text-[var(--gray-10)]">{title}</h3>
      <ul className="space-y-1 font-mono text-xs break-all text-[var(--gray-12)]">
        {lines.map((line, i) => (
          <li key={i}>{line}</li>
        ))}
      </ul>
    </div>
  )
}

/** The page, browser and errors the browser extension captured with the task; nothing for other tasks. */
export function TaskBrowserCapture({ metadata }: { metadata: TicketMetadata | null | undefined }) {
  const [open, setOpen] = useState(false)
  const capture = browserCaptureOf(metadata)
  if (!capture) return null

  const consoleLines = [
    ...capture.console.map((entry) => `${entry.level}: ${entry.message}`),
    ...capture.uncaughtErrors.map(describeUncaughtError),
  ]
  const requestLines = capture.failedRequests.map(describeFailedRequest)
  const problems = [
    consoleLines.length > 0 ? count(consoleLines.length, 'console error', 'console errors') : null,
    requestLines.length > 0 ? count(requestLines.length, 'failed request', 'failed requests') : null,
  ].filter((part): part is string => part !== null)

  return (
    <section aria-label="Captured by the browser extension" className="space-y-2 border-b border-[var(--gray-5)] pb-5">
      <h2 className="text-xs font-semibold text-[var(--gray-10)]">Captured by the browser extension</h2>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-[var(--gray-11)]">
        {capture.pageUrl && (
          <a
            href={capture.pageUrl}
            target="_blank"
            rel="noreferrer"
            className="max-w-full truncate text-[var(--accent-11)] underline decoration-[var(--gray-7)] underline-offset-2 hover:decoration-current"
          >
            {capture.pageUrl}
          </a>
        )}
        {capture.browser && <span>{capture.browser}</span>}
        {capture.viewport && (
          <span>
            Viewport {capture.viewport}
            {capture.pixelRatio && capture.pixelRatio !== 1 ? ` at ${capture.pixelRatio}x` : ''}
          </span>
        )}
        {problems.length === 0 ? (
          <span>No console errors or failed requests</span>
        ) : (
          <button
            type="button"
            aria-expanded={open}
            aria-controls="task-browser-capture"
            onClick={() => setOpen(!open)}
            className="flex items-center gap-1 hover:text-[var(--gray-12)]"
          >
            <span aria-hidden>{open ? '▾' : '▸'}</span>
            {problems.join(', ')}
          </button>
        )}
      </div>
      {open && (
        <div id="task-browser-capture" className="max-w-4xl space-y-3 rounded-[7px] border border-[var(--gray-5)] bg-[var(--gray-2)] p-4">
          <Entries title="Console" lines={consoleLines} />
          <Entries title="Failed requests" lines={requestLines} />
        </div>
      )}
    </section>
  )
}
