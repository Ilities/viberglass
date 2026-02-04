import { Button } from '@/components/button'
import { ArrowClockwiseIcon } from '@radix-ui/react-icons'

export function JobRefreshButton({ onRefresh }: { onRefresh: () => void }) {
  return (
    <Button plain onClick={() => window.location.reload()}>
      <ArrowClockwiseIcon className="h-4 w-4" />
      Refresh
    </Button>
  )
}
