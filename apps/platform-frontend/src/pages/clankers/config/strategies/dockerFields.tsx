import { Description, Field, Label } from '@/components/fieldset'
import { Input } from '@/components/input'
import type { StrategyFieldsRendererProps } from './types'

export function DockerStrategyFields({ provisioningMode, defaults }: StrategyFieldsRendererProps) {
  if (provisioningMode === 'prebuilt') {
    return (
      <Field>
        <Label>Container Image</Label>
        <Description>The Docker image to use for this clanker.</Description>
        <Input
          name="containerImage"
          defaultValue={defaults.containerImage}
          placeholder="ghcr.io/myorg/clanker:latest"
        />
      </Field>
    )
  }

  return (
    <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
      Image will be built from the project Dockerfile on start.
    </div>
  )
}
