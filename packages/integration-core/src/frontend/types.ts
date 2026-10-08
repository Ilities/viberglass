import type { TicketSystem } from '@viberglass/types'
import type { ComponentType } from 'react'

/** An event a tracker's webhook can send, as the connection screen offers it. */
export interface TrackerWebhookEvent {
  value: string
  label: string
  description: string
}

/**
 * How the connection screen and a space's settings talk about a tracker whose
 * issues become linked tasks.
 */
export interface TrackerWebhookDescriptor {
  /** "Jira", "Shortcut", "GitHub". */
  tracker: string
  /** What the tracker calls an issue: "story" in Shortcut. */
  item: string
  /** Its plural: "stories". */
  items: string
  /** Adding the webhook in the tracker, step by step. */
  setupSteps: string[]
  events: TrackerWebhookEvent[]
  /** What to enter as the bot's name in this tracker. */
  botUsernameHint: string
  botUsernamePlaceholder: string
}

export interface AuthSetupSectionProps {
  // For OAuth/install flows like Slack - extend as needed
  getBotStatus?: () => Promise<{ configured: boolean }>
}

export interface IntegrationFrontendPlugin {
  id: TicketSystem
  /** Set for trackers whose issues spaces take as linked tasks. */
  trackerWebhook?: TrackerWebhookDescriptor
  /** Additional auth/install section (e.g. Slack OAuth); undefined = show nothing */
  AuthSetupSection?: ComponentType<AuthSetupSectionProps>
}
