import { Description, Field, Label } from '@/components/fieldset'
import { SegmentedControl } from '@/components/segmented-control'
import type { ReactNode } from 'react'
import { normalizeStrategyName, toProvisioningMode } from '../normalizers'
import type { ClankerConfigFormState, ProvisioningMode } from '../types'
import { DockerStrategyFields } from './dockerFields'
import { EcsStrategyFields } from './ecsFields'
import { LambdaStrategyFields } from './lambdaFields'
import type { StrategyFieldsRendererProps } from './types'

interface StrategySpecificFieldsProps {
  strategyName?: string
  provisioningMode: ProvisioningMode
  onProvisioningModeChange: (mode: ProvisioningMode) => void
  defaults: Partial<ClankerConfigFormState>
}

function renderStrategyFields(
  strategyName: string,
  props: StrategyFieldsRendererProps,
): ReactNode {
  const normalized = normalizeStrategyName(strategyName)
  if (normalized === 'ecs') {
    return <EcsStrategyFields {...props} />
  }
  if (normalized === 'aws-lambda-container' || normalized === 'lambda') {
    return <LambdaStrategyFields {...props} />
  }
  return <DockerStrategyFields {...props} />
}

export function StrategySpecificFields({
  strategyName,
  provisioningMode,
  onProvisioningModeChange,
  defaults,
}: StrategySpecificFieldsProps) {
  if (!strategyName) {
    return null
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
      {renderStrategyFields(strategyName, { provisioningMode, defaults })}
    </>
  )
}
