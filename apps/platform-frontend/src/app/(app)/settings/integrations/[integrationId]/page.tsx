import { IntegrationDetailClient } from './integration-detail-client'

// Static export support - generate empty params since data is fetched client-side
// The client component handles all the data fetching and routing
export async function generateStaticParams() {
  return [{ integrationId: '_' }]
}

export default function IntegrationDetailPage() {
  return <IntegrationDetailClient />
}
