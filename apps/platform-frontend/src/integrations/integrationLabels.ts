import { NATIVE_TICKET_ORIGIN } from '@viberglass/types'
import { integrationFrontendRegistry } from './registerFrontendIntegrationPlugins'

/** A connected system's name, or where a native task comes from; a system left out of the build shows as its id. */
export function integrationLabel(system: string): string {
  if (system === NATIVE_TICKET_ORIGIN) return 'Viberglass'
  return integrationFrontendRegistry.get(system)?.label ?? system
}

/** "GitHub, Jira or Shortcut": the trackers in this build whose issues spaces can take. */
export function trackerNames(): string {
  const names = integrationFrontendRegistry
    .list()
    .filter((plugin) => plugin.trackerWebhook)
    .map((plugin) => plugin.label)
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} or ${names[names.length - 1]}` : (names[0] ?? 'a tracker')
}
