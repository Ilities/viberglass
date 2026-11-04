import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { OpenAppPage } from './OpenAppPage'

const mockOpen = jest.fn()
jest.mock('@/service/api/app-api', () => ({ openApp: (...args: unknown[]) => mockOpen(...args) }))

function renderAt(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/apps/:slug/open" element={<OpenAppPage />} />
      </Routes>
    </MemoryRouter>
  )
}

describe('OpenAppPage', () => {
  it('names who can turn an app on when it is off', async () => {
    mockOpen.mockResolvedValue({ status: 'off', appName: 'Laptops', maintainers: ['Ada', 'Grace'] })
    renderAt('/apps/laptops/open?return=%2F')

    expect(await screen.findByRole('heading', { name: 'Laptops is off' })).toBeInTheDocument()
    expect(screen.getByText('Ask Ada or Grace or a workspace admin to turn it on.')).toBeInTheDocument()
  })

  it('sends people to the task when a preview is off', async () => {
    mockOpen.mockResolvedValue({ status: 'preview_off', taskKey: 'LT-2', taskPath: '/spaces/laptops/tasks/task-1' })
    renderAt('/apps/preview-abcd2345/open?return=%2F&state=s')

    expect(await screen.findByRole('heading', { name: 'This preview is off' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Go to LT-2' })).toHaveAttribute('href', '/spaces/laptops/tasks/task-1')
    expect(mockOpen).toHaveBeenCalledWith('preview-abcd2345', '/', 's')
  })
})
