import { render, screen } from '@testing-library/react'
import { SsmPathField } from './ssm-path-field'

describe('SsmPathField', () => {
  it('places a new secret under the prefix by id and keeps the custom path closed', () => {
    render(<SsmPathField path="" ssmPrefix="/viberator/secrets" onChange={jest.fn()} />)

    expect(screen.getByTestId('ssm-path-summary')).toHaveTextContent('Stored at /viberator/secrets/<secret id>.')
    expect(screen.getByText('Advanced: use a custom path').closest('details')).not.toHaveAttribute('open')
  })

  it('shows where an existing secret is stored', () => {
    render(
      <SsmPathField
        path=""
        storedPath="/viberator/secrets/GITHUB_TOKEN"
        ssmPrefix="/viberator/secrets"
        onChange={jest.fn()}
      />,
    )

    expect(screen.getByTestId('ssm-path-summary')).toHaveTextContent('Stored at /viberator/secrets/GITHUB_TOKEN.')
  })

  it('opens for a secret stored outside the prefix', () => {
    render(<SsmPathField path="/legacy/github" ssmPrefix="/viberator/secrets" onChange={jest.fn()} />)

    expect(screen.getByTestId('ssm-path-summary')).toHaveTextContent('Stored at /legacy/github.')
    expect(screen.getByText('Advanced: use a custom path').closest('details')).toHaveAttribute('open')
  })
})
