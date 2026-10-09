import { IntegrationFrontendRegistry } from '@viberglass/integration-core/frontend'
import { configuredFrontendIntegrationPlugins } from './configuredFrontendIntegrationPlugins'

export const integrationFrontendRegistry = new IntegrationFrontendRegistry()
for (const plugin of configuredFrontendIntegrationPlugins) integrationFrontendRegistry.register(plugin)
