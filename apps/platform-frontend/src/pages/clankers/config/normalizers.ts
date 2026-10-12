import type { ProvisioningMode, StrategyName } from './types'

export function normalizeStrategyName(value?: string): StrategyName {
  const normalized = (value || '').toLowerCase()
  if (normalized === 'kubernetes') return 'kubernetes'
  if (normalized === 'ecs') return 'ecs'
  if (normalized === 'aws-lambda-container') return 'aws-lambda-container'
  if (normalized === 'lambda') return 'lambda'
  return 'docker'
}

export function toProvisioningMode(value: string): ProvisioningMode {
  return value === 'prebuilt' ? 'prebuilt' : 'managed'
}

/** Docker runs the agent's published image unless asked to build one; the cloud strategies create their own resources. */
export function defaultProvisioningMode(strategyName?: string): ProvisioningMode {
  return normalizeStrategyName(strategyName) === 'docker' ? 'prebuilt' : 'managed'
}
