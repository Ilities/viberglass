/**
 * Where Viberglass creates App spaces' repositories: a code host connection,
 * the token to create them with (null: the connection's default) and the
 * account or organisation that owns them.
 */
export interface AppHome {
  integrationId: string
  credentialId: string | null
  owner: string
}

/** What an installation needs before it offers App spaces. */
export type AppSpaceRequirement = 'apps_domain' | 'object_storage' | 'app_home'

export interface AppSpaceAvailability {
  available: boolean
  missing: AppSpaceRequirement[]
}

/** API contract of `GET /api/app-home`. */
export interface AppHomeStatus {
  home: AppHome | null
  availability: AppSpaceAvailability
}
