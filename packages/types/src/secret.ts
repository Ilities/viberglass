export type SecretLocation = 'env' | 'database' | 'ssm'

export interface Secret {
  id: string
  name: string
  secretLocation: SecretLocation
  secretPath?: string | null
  createdAt: string
  updatedAt: string
}

/** Where new secrets go by default on this instance. */
export interface SecretStorageDefaults {
  /** SSM when agents run on ECS, whose workers read secrets only from SSM. */
  location: 'database' | 'ssm'
  /** SSM secrets are stored at `<ssmPrefix>/<NAME>`, where workers look them up. */
  ssmPrefix: string
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
