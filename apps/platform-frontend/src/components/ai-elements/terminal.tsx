import { cn } from '@/lib/utils'

// Strips ANSI escape codes from terminal output
function stripAnsi(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\x1b\[[0-9;]*[mGKHF]/g, '').replace(/\x1b[()][AB012]/g, '')
}

interface TerminalProps {
  children: string
  className?: string
  maxHeight?: string
}

/**
 * Terminal — displays raw command output in a styled scrollable code block.
 * Strips ANSI escape codes for clean rendering.
 */
export function Terminal({ children, className, maxHeight = 'max-h-80' }: TerminalProps) {
  const clean = stripAnsi(children)
  return (
    <pre
      className={cn(
        'overflow-auto rounded border border-[var(--gray-6)] bg-[var(--gray-1)] px-3 py-2',
        'font-mono text-[11px] leading-relaxed whitespace-pre-wrap break-words text-[var(--gray-12)]',
        maxHeight,
        className,
      )}
    >
      {clean || '(no output)'}
    </pre>
  )
}
