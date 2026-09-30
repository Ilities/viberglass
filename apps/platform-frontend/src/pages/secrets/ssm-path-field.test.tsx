import { render, screen } from '@testing-library/react'
import { SsmPathField } from './ssm-path-field'

describe('SsmPathField', () => {
  it('shows the default path and keeps the custom path closed', () => {
    render(<SsmPathField name="GITHUB_TOKEN" path="" ssmPrefix="/viberator/secrets" onChange={jest.fn()} />)

    expect(screen.getByTestId('ssm-path-summary')).toHaveTextContent('Stored at /viberator/secrets/GITHUB_TOKEN.')
    expect(screen.getByText('Advanced: use a custom path').closest('details')).not.toHaveAttribute('open')
  })

  it('opens for a secret that already has a custom path', () => {
    render(<SsmPathField name="GITHUB_TOKEN" path="/legacy/github" ssmPrefix="/viberator/secrets" onChange={jest.fn()} />)

    expect(screen.getByTestId('ssm-path-summary')).toHaveTextContent('Stored at /legacy/github.')
    expect(screen.getByText('Advanced: use a custom path').closest('details')).toHaveAttribute('open')
  })
})
