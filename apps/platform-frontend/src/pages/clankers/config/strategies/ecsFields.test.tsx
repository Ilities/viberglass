import { Theme } from '@radix-ui/themes'
import { render } from '@testing-library/react'
import { DEFAULT_CLANKER_CONFIG_FORM_STATE } from '../types'
import { EcsStrategyFields } from './ecsFields'

function hiddenValue(container: HTMLElement, name: string) {
  return container.querySelector<HTMLInputElement>(`input[type="hidden"][name="${name}"]`)?.value
}

it('submits the stored ECS size', () => {
  const { container } = render(
    <Theme>
      <EcsStrategyFields provisioningMode="managed" defaults={{ ...DEFAULT_CLANKER_CONFIG_FORM_STATE, ecsCpu: '2048', ecsMemory: '8192' }} />
    </Theme>,
  )
  expect(hiddenValue(container, 'ecsCpu')).toBe('2048')
  expect(hiddenValue(container, 'ecsMemory')).toBe('8192')
})

it('submits no size when the runner uses the platform default', () => {
  const { container } = render(
    <Theme>
      <EcsStrategyFields provisioningMode="managed" defaults={DEFAULT_CLANKER_CONFIG_FORM_STATE} />
    </Theme>,
  )
  expect(hiddenValue(container, 'ecsCpu')).toBe('')
  expect(hiddenValue(container, 'ecsMemory')).toBe('')
})

it('asks a pre-built runner for its task definition instead of a size', () => {
  const { container } = render(
    <Theme>
      <EcsStrategyFields provisioningMode="prebuilt" defaults={DEFAULT_CLANKER_CONFIG_FORM_STATE} />
    </Theme>,
  )
  expect(hiddenValue(container, 'ecsCpu')).toBeUndefined()
})
