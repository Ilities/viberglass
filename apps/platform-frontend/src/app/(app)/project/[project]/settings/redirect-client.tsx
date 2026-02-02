'use client'

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

export function SettingsRedirectClient({ project }: { project: string }) {
  const router = useRouter()

  useEffect(() => {
    router.replace(`/project/${project}/settings/project`)
  }, [project, router])

  return null
}
