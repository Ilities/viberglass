import { Button } from '@/components/button'
import { CopyIcon } from '@radix-ui/react-icons'
import { toast } from 'sonner'

interface CopyButtonProps {
  /** What lands on the clipboard. */
  value: string
  /** What the button is called, for screen readers and its tooltip. */
  label?: string
  className?: string
}

/** Copies a value and says it happened, so a copy is never a guess. */
export function CopyButton({ value, label = 'Copy', className }: CopyButtonProps) {
  async function copy() {
    try {
      await navigator.clipboard.writeText(value)
      toast.success('Copied to clipboard')
    } catch {
      toast.error("Couldn't copy to clipboard")
    }
  }

  return (
    <Button plain aria-label={label} title={label} className={className} onClick={() => void copy()}>
      <CopyIcon className="size-4" />
    </Button>
  )
}
