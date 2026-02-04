import { Button } from '@/components/button'
import { ReloadIcon } from '@radix-ui/react-icons'

export function JobRefreshButton({ onRefresh }: { onRefresh: () => void }) {
  return (
    <Button plain onClick={() => window.location.reload()}>
      <ReloadIcon className="h-4 w-4" />
      Refresh
    </Button>
  )
}
