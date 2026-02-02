'use client'

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

export function IntegrationRedirectClient({ integrationId }: { integrationId: string }) {
  const router = useRouter()

  useEffect(() => {
    router.replace(`/settings/integrations/${integrationId}`)
  }, [integrationId, router])

  return null
}
