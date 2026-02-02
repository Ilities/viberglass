'use client'

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

/**
 * Redirect page for old project webhooks route.
 * Webhooks are now configured under individual integrations.
 */
export function WebhooksRedirectClient() {
  const router = useRouter()

  useEffect(() => {
    router.replace('/settings/integrations')
  }, [router])

  return null
}
