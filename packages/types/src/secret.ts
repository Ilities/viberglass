export type SecretLocation = 'env' | 'database' | 'ssm'

export interface Secret {
  id: string
  name: string
  secretLocation: SecretLocation
  secretPath?: string | null
  createdAt: string
  updatedAt: string
}

export interface CreateSecretRequest {
  name: string
  secretLocation: SecretLocation
  secretPath?: string | null
  secretValue?: string
}

export interface UpdateSecretRequest {
  name?: string
  secretLocation?: SecretLocation
  secretPath?: string | null
  secretValue?: string
}
