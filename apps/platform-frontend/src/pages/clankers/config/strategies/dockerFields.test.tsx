import { Theme } from '@radix-ui/themes'
import { fireEvent, render, screen } from '@testing-library/react'
import { DEFAULT_CLANKER_CONFIG_FORM_STATE, type ProvisioningMode } from '../types'
import { DockerStrategyFields } from './dockerFields'

function renderFields(provisioningMode: ProvisioningMode, canBuildFromSource: boolean) {
  return render(
    <Theme>
      <DockerStrategyFields
        provisioningMode={provisioningMode}
        onProvisioningModeChange={jest.fn()}
        canBuildFromSource={canBuildFromSource}
        defaults={DEFAULT_CLANKER_CONFIG_FORM_STATE}
      />
    </Theme>,
  )
}

it('offers building from source when the backend can', () => {
  renderFields('prebuilt', true)
  expect(screen.getByRole('button', { name: 'Published image' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Build from source' })).toBeInTheDocument()
})

it('hides building from source when the backend has no source checkout', () => {
  renderFields('prebuilt', false)
  expect(screen.queryByRole('button', { name: 'Build from source' })).not.toBeInTheDocument()
  expect(screen.getByText('Container Image')).toBeInTheDocument()
})

it('keeps a saved source build visible and says it cannot run here', () => {
  renderFields('managed', false)
  expect(screen.getByRole('button', { name: 'Build from source' })).toBeInTheDocument()
  expect(screen.getByText(/can't do because the backend has no source checkout/)).toBeInTheDocument()
})

it('explains how to use your own worker image', () => {
  renderFields('prebuilt', false)
  fireEvent.click(screen.getByRole('button', { name: 'Using your own worker image' }))
  expect(screen.getByText(/build-workers\.sh all/)).toBeInTheDocument()
})
