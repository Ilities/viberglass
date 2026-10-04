import { Theme } from '@radix-ui/themes'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import type { TaskCapabilities } from '@viberglass/types'
import { testTask } from '../space/test-task'
import { TaskActionsMenu } from './task-actions-menu'

const NOTHING: TaskCapabilities = { canPost: false, canAsk: false, canAskForCode: false, canSteer: false, canEdit: false, canDelete: false }

async function itemsFor(capabilities: TaskCapabilities) {
  render(
    <Theme>
      <MemoryRouter>
        <TaskActionsMenu
          ticket={testTask('1')}
          space="web"
          capabilities={capabilities}
          onEdit={jest.fn()}
          onSetDone={jest.fn()}
          onArchive={jest.fn()}
          onDelete={jest.fn()}
        />
      </MemoryRouter>
    </Theme>
  )
  await userEvent.setup().click(screen.getByRole('button', { name: /Actions/ }))
  return (await screen.findAllByRole('menuitem')).map((item) => item.textContent)
}

describe('TaskActionsMenu', () => {
  it('gives a viewer only the link to copy', async () => {
    expect(await itemsFor(NOTHING)).toEqual(['Copy link'])
  })

  it("lets the task's owner edit, close and archive it, but not delete it", async () => {
    expect(await itemsFor({ ...NOTHING, canEdit: true })).toEqual(['Edit details', 'Copy link', 'Finish task', 'Archive'])
  })

  it('adds delete for admins', async () => {
    expect(await itemsFor({ ...NOTHING, canEdit: true, canDelete: true })).toContain('Delete task')
  })
})
