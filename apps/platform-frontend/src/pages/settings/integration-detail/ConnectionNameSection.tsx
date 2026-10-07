import { Button } from '@/components/button'
import { Subheading } from '@/components/heading'
import { Input } from '@/components/input'
import { updateIntegration } from '@/service/api/integration-api'
import type { Integration } from '@viberglass/types'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

/** Renames a saved connection. Spaces show this name when picking a code host or tracker. */
export function ConnectionNameSection({
  integration,
  onRenamed,
}: {
  integration: Integration
  onRenamed: (integration: Integration) => void
}) {
  const [name, setName] = useState(integration.name)
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    setName(integration.name)
  }, [integration.name])

  const trimmed = name.trim()
  const canSave = trimmed.length > 0 && trimmed !== integration.name && !isSaving

  const handleSave = async () => {
    setIsSaving(true)
    try {
      onRenamed(await updateIntegration(integration.id, { name: trimmed }))
      toast.success('Connection renamed')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to rename the connection')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <section className="app-frame rounded-lg p-6">
      <Subheading>Name</Subheading>
      <form
        className="mt-4 flex max-w-md items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault()
          if (canSave) void handleSave()
        }}
      >
        <Input
          aria-label="Connection name"
          className="flex-1"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        <Button type="submit" color="brand" disabled={!canSave}>
          {isSaving ? 'Saving…' : 'Save'}
        </Button>
      </form>
    </section>
  )
}
