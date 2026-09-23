import { Alert, AlertActions, AlertDescription, AlertTitle } from '@/components/alert'
import { Button } from '@/components/button'
import { Subheading } from '@/components/heading'
import { Text } from '@/components/text'
import { deleteIntegration } from '@/service/api/integration-api'
import { useState } from 'react'

/**
 * Removes an integration with its credentials and webhooks. The server refuses
 * while projects still use it and says which ones.
 */
export function RemoveIntegrationSection({
  integrationId,
  name,
  onRemoved,
}: {
  integrationId: string
  name: string
  onRemoved: () => void
}) {
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [isRemoving, setIsRemoving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleRemove = async () => {
    setConfirmOpen(false)
    setIsRemoving(true)
    setError(null)
    try {
      await deleteIntegration(integrationId)
      onRemoved()
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : 'Failed to remove integration')
      setIsRemoving(false)
    }
  }

  return (
    <section className="app-frame rounded-lg p-6">
      <Subheading>Remove integration</Subheading>
      <Text className="mt-1 text-[var(--gray-9)]">
        Deletes this integration together with its credentials and webhooks.
      </Text>
      <Button className="mt-4" color="red" disabled={isRemoving} onClick={() => setConfirmOpen(true)}>
        {isRemoving ? 'Removing…' : 'Remove integration'}
      </Button>
      {error && <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>}
      <Alert open={confirmOpen} onClose={setConfirmOpen}>
        <AlertTitle>Remove {name}?</AlertTitle>
        <AlertDescription>
          Its credentials and webhooks are deleted too. Webhooks already set up in the other tool will stop being
          received. This cannot be undone.
        </AlertDescription>
        <AlertActions>
          <Button plain onClick={() => setConfirmOpen(false)}>
            Keep it
          </Button>
          <Button color="red" onClick={() => void handleRemove()}>
            Remove
          </Button>
        </AlertActions>
      </Alert>
    </section>
  )
}
