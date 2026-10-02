import { Button } from '@/components/button'
import { Link } from '@/components/link'
import type { Project } from '@viberglass/types'

/** Start a task: straight to the new-task page with one space, otherwise pick the space first. */
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
    <nav aria-label="Ask for something in" className="flex flex-wrap items-center justify-center gap-2 text-sm">
      <span className="text-[var(--gray-11)]">Ask for something in</span>
      {spaces.map((space) => (
        <Link key={space.id} href={`/spaces/${space.slug}/tasks/new`} className="ui-text-action">
          {space.name}
        </Link>
      ))}
    </nav>
  )
}
