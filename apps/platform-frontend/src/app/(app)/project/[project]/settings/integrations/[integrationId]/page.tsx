import { IntegrationRedirectClient } from './integration-redirect-client'

export async function generateStaticParams() {
  return [{ project: '_', integrationId: '_' }]
}

export default async function IntegrationRedirect({ params }: { params: Promise<{ integrationId: string }> }) {
  const { integrationId } = await params
  return <IntegrationRedirectClient integrationId={integrationId} />
}
