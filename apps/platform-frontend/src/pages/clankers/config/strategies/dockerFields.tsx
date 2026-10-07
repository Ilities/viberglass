import { Description, Field, Label } from '@/components/fieldset'
import { Input } from '@/components/input'
import type { StrategyFieldsRendererProps } from './types'

export function DockerStrategyFields({ provisioningMode, defaults }: StrategyFieldsRendererProps) {
  if (provisioningMode === 'prebuilt') {
    return (
      <Field>
        <Label>Container Image</Label>
        <Description>Leave empty to use the published image for this agent. It's pulled the first time the runner starts.</Description>
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
      The image is built from the agent's worker Dockerfile when the runner starts, which takes several minutes.
    </div>
  )
}
