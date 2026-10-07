import { Heading } from '@/components/heading'
import { PageMeta } from '@/components/page-meta'
import { ConnectedModelsSection } from './ConnectedModelsSection'
import { DeployedModelsSection } from './DeployedModelsSection'

/** The workspace's own models; agents pick them in their Model section. */
export function ModelsPage() {
  return (
    <>
      <PageMeta title="Models" />
      <div className="space-y-10">
        <div>
          <Heading>Models</Heading>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            Models your agents can run on besides the built-in providers.
          </p>
        </div>
        <ConnectedModelsSection />
        <DeployedModelsSection />
      </div>
    </>
  )
}
