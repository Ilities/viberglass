import { Button } from '@/components/button'
import { Dialog as RadixDialog } from '@radix-ui/themes'

/**
 * A document over the whole window, for reading: a quiet bar with what it
 * is, and the text in one wide column, with room for code and tables. Escape or
 * Exit full screen goes back to the task.
 */
export function FullScreenReader({
  open,
  onClose,
  title,
  meta,
  children,
}: {
  open: boolean
  onClose: () => void
  title: React.ReactNode
  meta?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <RadixDialog.Root open={open} onOpenChange={(next) => !next && onClose()}>
      <RadixDialog.Content
        width="100vw"
        maxWidth="100vw"
        height="100dvh"
        maxHeight="100dvh"
        className="ui-full-screen-dialog !m-0 !rounded-none !p-0"
        aria-describedby={undefined}
      >
        <div className="flex h-full flex-col">
          <div className="flex shrink-0 items-center justify-between gap-4 border-b border-[var(--gray-5)] bg-[var(--gray-2)] px-6 py-3 max-sm:px-4">
            <div className="min-w-0">
              <RadixDialog.Title className="!m-0 flex items-center gap-2 text-sm font-semibold text-[var(--gray-12)]">{title}</RadixDialog.Title>
              {meta && <p className="mt-0.5 truncate text-xs text-[var(--gray-10)]">{meta}</p>}
            </div>
            <Button outline onClick={onClose}>
              Exit full screen
            </Button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <article className="mx-auto max-w-[76rem] px-8 py-12 max-sm:px-4 max-sm:py-8">{children}</article>
          </div>
        </div>
      </RadixDialog.Content>
    </RadixDialog.Root>
  )
}
