'use client'

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

export function AIRedirectClient({ project }: { project: string }) {
  const router = useRouter()

  useEffect(() => {
    router.replace(`/project/${project}/settings/project`)
  }, [project, router])

  return null
}
