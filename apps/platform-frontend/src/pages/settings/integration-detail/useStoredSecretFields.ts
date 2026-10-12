import { getIntegrationCredentials } from '@/service/api/integration-api'
import type { Integration, IntegrationManifest } from '@viberglass/types'
import { useEffect, useState } from 'react'

/** Keys of the connection's `secret` fields that hold a value, read again after each save. */
export function useStoredSecretFields(manifest: IntegrationManifest | null, connection: Integration | null): string[] {
  const [stored, setStored] = useState<string[]>([])
  const hasSecretFields = Boolean(manifest?.configFields.some((field) => field.type === 'secret'))
  const connectionId = connection?.id
  const savedAt = connection?.updatedAt

  useEffect(() => {
    if (!hasSecretFields || !connectionId) {
      setStored([])
      return
    }
    let isActive = true
    getIntegrationCredentials(connectionId)
      .then((credentials) => {
        if (isActive) {
          setStored(credentials.filter((credential) => credential.credentialType === 'secret_field').map((credential) => credential.name))
        }
      })
      .catch(() => {
        if (isActive) setStored([])
      })
    return () => {
      isActive = false
    }
  }, [hasSecretFields, connectionId, savedAt])

  return stored
}
