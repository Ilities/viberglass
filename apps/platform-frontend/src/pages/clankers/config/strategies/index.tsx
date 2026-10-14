import { Description, Field, Label } from '@/components/fieldset'
import { SegmentedControl } from '@/components/segmented-control'
import { normalizeStrategyName, toProvisioningMode } from '../normalizers'
import type { ClankerConfigFormState, ProvisioningMode } from '../types'
import { KubernetesStrategyFields } from './kubernetesFields'
import { DockerStrategyFields } from './dockerFields'
import { EcsStrategyFields } from './ecsFields'
import { LambdaStrategyFields } from './lambdaFields'

interface StrategySpecificFieldsProps {
  strategyName?: string
  provisioningMode: ProvisioningMode
  onProvisioningModeChange: (mode: ProvisioningMode) => void
  canBuildFromSource: boolean
  defaults: ClankerConfigFormState
}

export function StrategySpecificFields({
  strategyName,
  provisioningMode,
  onProvisioningModeChange,
  canBuildFromSource,
  defaults,
}: StrategySpecificFieldsProps) {
  if (!strategyName) {
    return null
  }

  const normalized = normalizeStrategyName(strategyName)
  if (normalized === 'kubernetes') return <KubernetesStrategyFields defaults={defaults} />
  if (normalized === 'docker') {
    return (
      <DockerStrategyFields
        provisioningMode={provisioningMode}
        onProvisioningModeChange={onProvisioningModeChange}
        canBuildFromSource={canBuildFromSource}
        defaults={defaults}
      />
    )
  }

  return (
    <>
      <Field>
        <Label>Provisioning Mode</Label>
        <Description>Choose whether the platform manages resources or you provide your own.</Description>
        <SegmentedControl
          options={[
            { value: 'managed', label: 'Managed' },
            { value: 'prebuilt', label: 'Pre-built' },
          ]}
          value={provisioningMode}
          onChange={(value) => onProvisioningModeChange(toProvisioningMode(value))}
        />
      </Field>
      {normalized === 'ecs' ? (
        <EcsStrategyFields provisioningMode={provisioningMode} defaults={defaults} />
      ) : (
        <LambdaStrategyFields provisioningMode={provisioningMode} defaults={defaults} />
      )}
    </>
  )
}
