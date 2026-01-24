'use client'

import { Button } from '@/components/button'
import { SparklesIcon } from '@heroicons/react/20/solid'
import { useRouter } from 'next/navigation'

export function EnhanceFixButton({ href }: { href: string }) {
  const router = useRouter()

  return (
    <Button color="blue" onClick={() => router.push(href)}>
      <SparklesIcon className="h-5 w-5" />
      Enhance & Fix
    </Button>
  )
}
