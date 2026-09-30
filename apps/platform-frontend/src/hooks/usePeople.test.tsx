import { render, screen } from '@testing-library/react'
import { resetPeopleDirectory, usePersonName } from './usePeople'

jest.mock('@/service/api/user-api', () => ({
  getPeopleDirectory: jest.fn().mockResolvedValue([
    { id: 'user-1', email: 'maria.pm@example.com', name: 'Maria', avatarUrl: null },
    { id: 'user-2', email: 'no.name@example.com', name: '', avatarUrl: null },
  ]),
}))

function Actor({ actor }: { actor: string | null }) {
  const personName = usePersonName()
  return <span>{personName(actor) ?? 'nobody'}</span>
}

describe('usePersonName', () => {
  beforeEach(() => resetPeopleDirectory())

  it('names a person stored by id or by email', async () => {
    render(
      <>
        <Actor actor="user-1" />
        <Actor actor="Maria.PM@example.com" />
      </>
    )
    expect(await screen.findAllByText('Maria')).toHaveLength(2)
  })

  it('shows unknown or unnamed actors as stored', async () => {
    render(
      <>
        <Actor actor="no.name@example.com" />
        <Actor actor="github-bot" />
        <Actor actor={null} />
      </>
    )
    expect(await screen.findByText('no.name@example.com')).toBeInTheDocument()
    expect(screen.getByText('github-bot')).toBeInTheDocument()
    expect(screen.getByText('nobody')).toBeInTheDocument()
  })
})
