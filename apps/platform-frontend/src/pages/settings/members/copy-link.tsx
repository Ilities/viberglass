import { Button } from '@/components/button'
import { useState } from 'react'

/** A link that is shown only once (the server keeps just its hash), with a copy button. */
export function CopyLink({ path, note }: { path: string; note: string }) {
  const url = `${window.location.origin}${path}`
  const [copied, setCopied] = useState(false)

  async function copy() {
    await navigator.clipboard.writeText(url)
    setCopied(true)
  }

  return (
    <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm dark:border-green-900 dark:bg-green-900/20">
      <p className="text-green-800 dark:text-green-300">{note}</p>
      <div className="mt-3 flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded bg-white px-2 py-1 text-xs text-zinc-800 dark:bg-zinc-900 dark:text-zinc-200" data-testid="one-time-link">
          {url}
        </code>
        <Button outline onClick={() => void copy()}>
          {copied ? 'Copied' : 'Copy link'}
        </Button>
      </div>
    </div>
  )
}
