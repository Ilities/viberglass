import { Button } from '@/components/button'
import { Subheading } from '@/components/heading'
import { Input } from '@/components/input'
import { Text } from '@/components/text'
import { createIntegration } from '@/service/api/integration-api'
import type { TicketSystem } from '@viberglass/types'
import { useState } from 'react'

/**
 * First step for integrations whose settings need a saved integration to hang
 * off (webhooks, credentials). Nothing is created until the user asks for it.
 */
export function CreateIntegrationPrompt({
  label,
  system,
  onCreated,
}: {
  label: string
  system: TicketSystem
  onCreated: (integrationId: string) => void
}) {
  const [name, setName] = useState(label)
  const [isCreating, setIsCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleCreate = async () => {
    setIsCreating(true)
    setError(null)
    try {
      const integration = await createIntegration({ name: name.trim() || label, system, config: {} })
      onCreated(integration.id)
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Failed to create integration')
      setIsCreating(false)
    }
  }

  return (
    <section className="app-frame rounded-lg p-6">
      <Subheading>Set up {label}</Subheading>
      <Text className="mt-1 text-[var(--gray-9)]">
        Give this connection a name your team will recognise. You can add credentials and webhooks next.
      </Text>
      <div className="mt-4 flex max-w-md items-end gap-3">
        <div className="flex-1">
          <label htmlFor="integration-name" className="mb-1 block text-sm font-medium text-[var(--gray-11)]">
            Name
          </label>
          <Input id="integration-name" value={name} onChange={(event) => setName(event.target.value)} />
        </div>
        <Button onClick={() => void handleCreate()} disabled={isCreating}>
          {isCreating ? 'Creating…' : `Create ${label} integration`}
        </Button>
      </div>
      {error && <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>}
    </section>
  )
}
