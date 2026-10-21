import { Theme } from '@radix-ui/themes'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { SpaceFilterBar, type SpaceFilters } from './space-filters'

const NONE: SpaceFilters = { search: '', state: 'all', artifact: 'all', severity: 'all', ownerId: 'all', waitingOn: 'all' }
const PEOPLE = { owners: [{ id: 'm', name: 'Maria' }], waitedOn: [] }

describe('SpaceFilterBar', () => {
  it('keeps search and state up front, and the rest behind More filters', () => {
    render(
      <Theme>
        <SpaceFilterBar filters={NONE} onChange={jest.fn()} onSearchChange={jest.fn()} people={PEOPLE} />
      </Theme>
    )
    expect(screen.getByRole('button', { name: 'More filters' })).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText('Severity')).not.toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'Active filters' })).not.toBeInTheDocument()
  })

  it('shows every set filter as a chip that clears it, even one hidden behind More filters', () => {
    const onChange = jest.fn()
    render(
      <Theme>
        <SpaceFilterBar filters={{ ...NONE, ownerId: 'm', severity: 'high' }} onChange={onChange} onSearchChange={jest.fn()} people={PEOPLE} />
      </Theme>
    )

    fireEvent.click(screen.getByRole('button', { name: 'Clear filter: Owned by Maria' }))
    expect(onChange).toHaveBeenLastCalledWith({ ...NONE, severity: 'high' })
    fireEvent.click(screen.getByRole('button', { name: 'Clear all' }))
    expect(onChange).toHaveBeenLastCalledWith(NONE)
  })

  it('applies a search once it settles, not on every keystroke', async () => {
    const onSearchChange = jest.fn()
    render(
      <Theme>
        <SpaceFilterBar filters={NONE} onChange={jest.fn()} onSearchChange={onSearchChange} people={PEOPLE} />
      </Theme>
    )

    const input = screen.getByRole('searchbox', { name: 'Search tasks' })
    fireEvent.change(input, { target: { value: 'log' } })
    expect(onSearchChange).not.toHaveBeenCalled()

    await waitFor(() => expect(onSearchChange).toHaveBeenCalledWith('log'), { timeout: 2000 })
  })

  it('shows the search that came with the page', () => {
    render(
      <Theme>
        <SpaceFilterBar filters={{ ...NONE, search: 'login' }} onChange={jest.fn()} onSearchChange={jest.fn()} people={PEOPLE} />
      </Theme>
    )

    expect(screen.getByRole('searchbox', { name: 'Search tasks' })).toHaveValue('login')
  })
})
