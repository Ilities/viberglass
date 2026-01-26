'use client'

import { Button } from '@/components/button'
import { MagicWandIcon } from '@radix-ui/react-icons'
import { useRouter } from 'next/navigation'

export function EnhanceFixButton({ href }: { href: string }) {
  const router = useRouter()

  return (
    <Button color="blue" onClick={() => router.push(href)}>
      <MagicWandIcon className="h-5 w-5" data-slot="icon" />
      Enhance & Fix
    </Button>
  )
}
