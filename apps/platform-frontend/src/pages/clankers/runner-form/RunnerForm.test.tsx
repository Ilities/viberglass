import { Theme } from '@radix-ui/themes'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { DeploymentStrategy } from '@viberglass/types'
import { getDeploymentStrategies } from '@/service/api/clanker-api'
import { RunnerForm } from './RunnerForm'

jest.mock('@/service/api/clanker-api', () => ({ getDeploymentStrategies: jest.fn() }))
jest.mock('@/service/api/secret-api', () => ({ listAllSecrets: jest.fn(async () => []) }))
jest.mock('@/service/api/model-endpoint-api', () => ({ listModelEndpoints: jest.fn(async () => []) }))
jest.mock('@/service/api/mcp-server-api', () => ({ listMcpServers: jest.fn(async () => []) }))
jest.mock('@/service/api/skill-api', () => ({ listSkills: jest.fn(async () => []) }))

function strategy(name: string): DeploymentStrategy {
  return { id: `${name}-id`, name, description: null, configSchema: null, createdAt: '' }
}

it.each([
  ['ecs', ['ecs', 'aws-lambda-container']],
  ['docker', ['docker', 'aws-lambda-container', 'ecs']],
  ['kubernetes', ['kubernetes', 'docker', 'ecs']],
])('selects and submits the deployment default %s', async (defaultName, names) => {
  jest.mocked(getDeploymentStrategies).mockResolvedValue(names.map(strategy))
  const onSubmit = jest.fn(async () => {})
  const { container } = render(
    <MemoryRouter>
      <Theme>
        <RunnerForm submitLabel="Save" submittingLabel="Saving" onSubmit={onSubmit} onCancel={jest.fn()} openAdvanced />
      </Theme>
    </MemoryRouter>,
  )
  await waitFor(() => expect(container.querySelector('input[name="deploymentStrategyId"]')).toHaveValue(`${defaultName}-id`))
  const options = screen.getByRole('radiogroup', { name: 'Deployment strategy selection' })
  expect(options.querySelectorAll('[role="radio"]')).toHaveLength(names.length)
  if (defaultName === 'ecs') expect(options).not.toHaveTextContent('Docker')
  fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Test runner' } })
  fireEvent.submit(container.querySelector('form')!)
  await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
    deploymentStrategyId: `${defaultName}-id`,
    deploymentConfig: expect.objectContaining({ strategy: expect.objectContaining({ type: defaultName }) }),
  })))
})
