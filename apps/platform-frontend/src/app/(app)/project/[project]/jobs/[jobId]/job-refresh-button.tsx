'use client'

import { useRouter } from 'next/navigation'
import { Button } from '@/components/button'

export function JobRefreshButton() {
  const router = useRouter()

  return (
    <Button onClick={() => router.refresh()} plain>
      Refresh
    </Button>
  )
}
