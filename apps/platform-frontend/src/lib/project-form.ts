import {
  isObjectRecord,
  type AuthCredentialType,
  type AuthCredentials,
  type Integration,
} from '@viberglass/types'

export const MANUAL_INTEGRATION_PLACEHOLDER = '__placeholder__'

export type LegacyAuthCredentials = AuthCredentials & Record<string, unknown>

type ProjectRepositoryShape = {
  repositoryUrls?: string[] | null
  repositoryUrl?: string | null
}

function isAuthCredentialType(value: unknown): value is AuthCredentialType {
  return value === 'api_key' || value === 'oauth' || value === 'basic' || value === 'token'
}

export function normalizeRepositoryUrls(repositoryUrls: string[]): string[] {
  return repositoryUrls.map((url) => url.trim()).filter(Boolean)
}

export function getInitialRepositoryUrls(project: ProjectRepositoryShape | null | undefined): string[] {
  const urls = project?.repositoryUrls ?? []
  if (urls.length > 0) {
    return urls
  }
  if (project?.repositoryUrl) {
    return [project.repositoryUrl]
  }
  return ['']
}

export function resolveManualTicketSystem(value: string | null | undefined): string {
  if (!value || value === MANUAL_INTEGRATION_PLACEHOLDER) {
    return ''
  }
  return value
}

export function parseCredentialsJson(credentialsRaw: string): LegacyAuthCredentials {
  const parsed: unknown = JSON.parse(credentialsRaw)
  if (!isObjectRecord(parsed)) {
    throw new Error('Invalid JSON in Credentials field')
  }
  const type: AuthCredentialType = isAuthCredentialType(parsed.type) ? parsed.type : 'api_key'
  return {
    ...parsed,
    type,
  }
}

export function extractCredentialsFromIntegration(
  integration: Integration
): LegacyAuthCredentials {
  // Extract credentials from the new config structure
  const config = integration.config
  const extracted: LegacyAuthCredentials = { 
    type: (config.authType as AuthCredentialType) || 'api_key',
  }
  for (const [key, value] of Object.entries(config)) {
    if (value !== undefined && key !== 'authType') {
      extracted[key] = value
    }
  }
  return extracted
}

export function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}
