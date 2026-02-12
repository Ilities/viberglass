import { Button } from '@/components/button'
import { ReloadIcon } from '@radix-ui/react-icons'

interface JobRefreshButtonProps {
  onRefresh: () => void
}

export function JobRefreshButton({ onRefresh }: JobRefreshButtonProps) {
  return (
    <Button plain onClick={onRefresh}>
      <ReloadIcon className="h-4 w-4" />
      Refresh
    </Button>
  )
}
