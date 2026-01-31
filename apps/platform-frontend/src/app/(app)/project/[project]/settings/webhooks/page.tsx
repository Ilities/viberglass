import { redirect } from 'next/navigation'

/**
 * Redirect page for old project webhooks route.
 * Webhooks are now configured under individual integrations.
 */
export default function ProjectWebhooksRedirectPage() {
  redirect('/settings/integrations')
}

export const generateStaticParams = async () => {
  return []
}
