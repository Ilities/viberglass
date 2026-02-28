import type { ClankerConfigFormState, ProvisioningMode } from '../types'

export interface StrategyFieldsRendererProps {
  provisioningMode: ProvisioningMode
  defaults: Partial<ClankerConfigFormState>
}
