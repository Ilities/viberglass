import { Button } from '@/components/button'
import { DrawingPinFilledIcon, DrawingPinIcon } from '@radix-ui/react-icons'

/** Pins something to the person's Home, or takes it off. */
export function PinButton({ pinned, onToggle }: { pinned: boolean; onToggle: () => void }) {
  return (
    <Button outline aria-pressed={pinned} onClick={onToggle}>
      {pinned ? <DrawingPinFilledIcon className="text-[var(--accent-10)]" /> : <DrawingPinIcon />}
      {pinned ? 'Pinned' : 'Pin to Home'}
    </Button>
  )
}
