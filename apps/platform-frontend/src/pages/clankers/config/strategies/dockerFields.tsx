import { Description, Field, Label } from '@/components/fieldset'
import { Input } from '@/components/input'
import { SegmentedControl } from '@/components/segmented-control'
import { toProvisioningMode } from '../normalizers'
import type { ProvisioningMode } from '../types'
import { OwnImageInfo } from './ownImageInfo'
import type { StrategyFieldsRendererProps } from './types'

interface DockerStrategyFieldsProps extends StrategyFieldsRendererProps {
  canBuildFromSource: boolean
  onProvisioningModeChange: (mode: ProvisioningMode) => void
}

const NOTE = 'rounded-lg border p-3 text-sm'

function SourceBuildNote({ canBuildFromSource }: { canBuildFromSource: boolean }) {
  if (!canBuildFromSource) {
    return (
      <div className={`${NOTE} border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300`}>
        This runner builds its image from source, which this installation can't do because the backend has no source
        checkout. Choose Published image to save it.
      </div>
    )
  }
  return (
    <div className={`${NOTE} border-zinc-200 bg-zinc-50 text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400`}>
      The image is built from the agent's worker Dockerfile when the runner starts, which takes several minutes.
    </div>
  )
}

export function DockerStrategyFields({
  provisioningMode,
  onProvisioningModeChange,
  canBuildFromSource,
  defaults,
}: DockerStrategyFieldsProps) {
  // A runner saved to build from source keeps showing that choice, so it isn't switched without the user seeing it.
  const offerSourceBuild = canBuildFromSource || provisioningMode === 'managed'

  return (
    <>
      <Field>
        <div data-slot="label" className="flex items-center gap-1.5">
          <Label>Image</Label>
          <OwnImageInfo />
        </div>
        <Description>
          {offerSourceBuild
            ? "Run a published worker image, or build one from this installation's source."
            : 'Runs the published worker image for this agent.'}
        </Description>
        {offerSourceBuild && (
          <SegmentedControl
            options={[
              { value: 'prebuilt', label: 'Published image' },
              { value: 'managed', label: 'Build from source' },
            ]}
            value={provisioningMode}
            onChange={(value) => onProvisioningModeChange(toProvisioningMode(value))}
          />
        )}
      </Field>
      {provisioningMode === 'prebuilt' ? (
        <Field>
          <Label>Container Image</Label>
          <Description>Leave empty to use the published image for this agent. It's pulled the first time the runner starts.</Description>
          <Input name="containerImage" defaultValue={defaults.containerImage} placeholder="ghcr.io/myorg/clanker:latest" />
        </Field>
      ) : (
        <SourceBuildNote canBuildFromSource={canBuildFromSource} />
      )}
    </>
  )
}
