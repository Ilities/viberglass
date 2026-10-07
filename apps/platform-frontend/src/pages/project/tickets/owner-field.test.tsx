import { Theme } from '@radix-ui/themes'
import { render, screen } from '@testing-library/react'
import { OwnerField } from './owner-field'

jest.mock('@/context/auth-context', () => ({ useAuth: () => ({ user: { id: 'me', role: 'member' } }) }))
jest.mock('@/service/api/user-api', () => ({
  getPeopleDirectory: () =>
    Promise.resolve([
      { id: 'me', name: 'Jussi' },
      { id: 'dev', name: 'Dev Koskinen' },
    ]),
}))

function renderField(defaultOwnerId: string | null) {
  render(
    <Theme>
      <OwnerField defaultOwnerId={defaultOwnerId} />
    </Theme>
  )
}

describe('OwnerField', () => {
  it("preselects the space's default owner", async () => {
    renderField('dev')

    expect(await screen.findByRole('combobox')).toHaveTextContent('Dev Koskinen')
  })

  it('falls back to whoever creates the task', async () => {
    renderField(null)

    expect(await screen.findByRole('combobox')).toHaveTextContent('Jussi (you)')
  })

  it('falls back when the default owner is no longer in the workspace', async () => {
    renderField('gone')

    expect(await screen.findByRole('combobox')).toHaveTextContent('Jussi (you)')
  })
})
