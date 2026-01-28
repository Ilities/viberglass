import { redirect } from 'next/navigation'

interface IntegrationRedirectProps {
  params: {
    integrationId: string
  }
}

export default function IntegrationRedirect({ params }: IntegrationRedirectProps) {
  redirect(`/settings/integrations/${params.integrationId}`)
}
