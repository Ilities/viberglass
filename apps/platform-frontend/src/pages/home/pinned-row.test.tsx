import { Theme } from '@radix-ui/themes'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import type { AppPin, ArtifactPin, Pin } from '@viberglass/types'
import { movePin, PinnedRow } from './pinned-row'

function artifactPin(id: string, title: string, overrides: Partial<ArtifactPin> = {}): ArtifactPin {
  return {
    id,
    target: { kind: 'artifact', artifactId: `art-${id}` },
    title,
    kind: 'artifact',
    available: true,
    spaceId: 'space-1',
    spaceSlug: 'board',
    spaceName: 'Board reporting',
    current: { versionId: `ver-${id}`, number: 3, format: 'markdown', cover: { kind: 'page', heading: title, excerpt: '' }, createdAt: '2026-11-12T09:00:00.000Z' },
    imageUrl: null,
    hasNewVersion: false,
    ...overrides,
  }
}

const app: AppPin = {
  id: 'app',
  target: { kind: 'app', spaceId: 'space-2' },
  title: 'Expense tracker',
  kind: 'app',
  available: true,
  spaceSlug: 'expenses',
  spaceName: 'Expense tracker',
  release: { status: 'live', commitSha: 'a3f9c21', createdAt: '2026-11-12T09:00:00.000Z' },
  running: true,
  appUrl: 'https://expenses.apps.test',
}

function renderRow(pins: Pin[], handlers: { onUnpin?: jest.Mock; onReorder?: jest.Mock } = {}) {
  const onUnpin = handlers.onUnpin ?? jest.fn()
  const onReorder = handlers.onReorder ?? jest.fn()
  render(
    <Theme>
      <MemoryRouter>
        <PinnedRow pins={pins} onUnpin={onUnpin} onReorder={onReorder} />
      </MemoryRouter>
    </Theme>
  )
  return { onUnpin, onReorder }
}

describe('movePin', () => {
  const pins = [artifactPin('a', 'A'), artifactPin('b', 'B'), artifactPin('c', 'C')]
  const order = (moved: Pin[]) => moved.map((pin) => pin.title).join('')

  it('moves a pin before another, or to the end', () => {
    expect(order(movePin(pins, 0, 2))).toBe('BAC')
    expect(order(movePin(pins, 2, 0))).toBe('CAB')
    expect(order(movePin(pins, 0, 3))).toBe('BCA')
  })

  it('leaves the order alone for moves that go nowhere', () => {
    expect(movePin(pins, 1, 1)).toBe(pins)
    expect(movePin(pins, 1, 2)).toBe(pins)
    expect(movePin(pins, 0, -1)).toBe(pins)
  })
})

describe('PinnedRow', () => {
  it('opens a running app in one click and an artifact at its page, marking a new version', () => {
    renderRow([app, artifactPin('a', 'Onboarding guide', { hasNewVersion: true })])

    expect(screen.getByRole('link', { name: /Expense tracker/ })).toHaveAttribute('href', 'https://expenses.apps.test')
    expect(screen.getByRole('link', { name: /Onboarding guide/ })).toHaveAttribute('href', '/spaces/board/artifacts/art-a')
    expect(screen.getByLabelText('New version')).toBeInTheDocument()
  })

  it("sends an app that isn't running to its releases, and says it's off", () => {
    renderRow([{ ...app, running: false }])

    expect(screen.getByRole('link', { name: /Expense tracker/ })).toHaveAttribute('href', '/spaces/expenses/app')
    expect(screen.getByText('Off')).toBeInTheDocument()
  })

  it('unpins from the tile, and moves a pin with Alt and the arrow keys', async () => {
    const pins = [artifactPin('a', 'Guide'), app]
    const { onUnpin, onReorder } = renderRow(pins)

    await userEvent.click(screen.getByRole('button', { name: 'Unpin Guide' }))
    expect(onUnpin).toHaveBeenCalledWith(pins[0])

    screen.getByRole('link', { name: /Guide/ }).focus()
    await userEvent.keyboard('{Alt>}{ArrowRight}{/Alt}')
    expect(onReorder).toHaveBeenCalledWith([app, pins[0]])
    expect(screen.getByText('Guide moved to position 2 of 2')).toBeInTheDocument()
  })

  it("keeps a pin that can't be opened any more, so it can be unpinned", () => {
    renderRow([{ id: 'gone', target: { kind: 'artifact', artifactId: 'art-x' }, title: 'Pricing teardown', kind: 'artifact', available: false }])

    expect(screen.getByText('Pricing teardown')).toBeInTheDocument()
    expect(screen.getByText('You can no longer open it.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Unpin Pricing teardown' })).toBeInTheDocument()
  })

  it('shows six pins until asked for all, and says how to pin when there are none', async () => {
    renderRow(Array.from({ length: 8 }, (_, index) => artifactPin(String(index), `Doc ${index}`)))
    expect(screen.getAllByRole('listitem')).toHaveLength(6)
    await userEvent.click(screen.getByRole('button', { name: 'Show all 8' }))
    expect(screen.getAllByRole('listitem')).toHaveLength(8)
  })

  it('points to Outputs when nothing is pinned', () => {
    renderRow([])

    expect(screen.getByRole('link', { name: 'Outputs' })).toHaveAttribute('href', '/outputs')
  })
})
