import { Button } from '@/components/button'
import { Dropdown, DropdownButton, DropdownItem, DropdownMenu } from '@/components/dropdown'
import type { Project } from '@viberglass/types'

/** Start a task: straight to the new-task page with one space, otherwise pick the space from the button's menu. */
export function AskForSomething({ spaces }: { spaces: Project[] }) {
  if (spaces.length === 0) {
    return (
      <Button href="/spaces/new" color="brand">
        Create a space
      </Button>
    )
  }
  if (spaces.length === 1) {
    return (
      <Button href={`/spaces/${spaces[0].slug}/tasks/new`} color="brand">
        Ask for something
      </Button>
    )
  }
  return (
    <Dropdown>
      <DropdownButton color="brand">Ask for something</DropdownButton>
      <DropdownMenu align="end">
        {spaces.map((space) => (
          <DropdownItem key={space.id} href={`/spaces/${space.slug}/tasks/new`}>
            In {space.name}
          </DropdownItem>
        ))}
      </DropdownMenu>
    </Dropdown>
  )
}
