import { WebhooksRedirectClient } from './webhooks-redirect-client'

export async function generateStaticParams() {
  return [{ project: '_' }]
}

export default function ProjectWebhooksRedirectPage() {
  return <WebhooksRedirectClient />
}
