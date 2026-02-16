import { useMemo, useCallback } from 'react'
import type { IntegrationWebhookDelivery } from '@/service/api/integration-api'

interface ProjectWithSlug {
  id: string
  name: string
  slug?: string
}

/**
 * Builds a map of projectId -> project slug for ticket URLs
 */
export function useProjectSlugMap(projects: ProjectWithSlug[] | null | undefined): Map<string, string> {
  return useMemo(() => {
    if (!projects) return new Map<string, string>()
    return new Map(projects.map((p) => [p.id, p.slug ?? p.id]))
  }, [projects])
}

/**
 * Returns a function to generate ticket URLs from delivery data
 * URLs are in format: /project/{slug}/tickets/{ticketId}
 */
export function useTicketUrlBuilder(
  projects: ProjectWithSlug[] | null | undefined
): (delivery: IntegrationWebhookDelivery) => string | null {
  const projectSlugMap = useProjectSlugMap(projects)

  return useCallback(
    (delivery: IntegrationWebhookDelivery): string | null => {
      if (!delivery.ticketId || !delivery.projectId) return null
      const slug = projectSlugMap.get(delivery.projectId)
      if (!slug) return null
      return `/project/${slug}/tickets/${delivery.ticketId}`
    },
    [projectSlugMap]
  )
}
