import { Button } from '@/components/button'

const PRIMARY: { color: 'brand' } = { color: 'brand' }
const SECONDARY: { outline: true } = { outline: true }

export function TaskViewSwitch({ view, onView, canPost }: {
  view: 'conversation' | 'artifact'
  onView: (view: 'conversation' | 'artifact') => void
  canPost: boolean
}) {
  return (
    <div role="group" aria-label="Show" className="flex flex-wrap gap-2">
      <Button {...(view === 'conversation' ? PRIMARY : SECONDARY)} aria-pressed={view === 'conversation'} onClick={() => onView('conversation')}>
        Conversation
      </Button>
      <Button {...(view === 'artifact' ? PRIMARY : SECONDARY)} aria-pressed={view === 'artifact'} onClick={() => onView('artifact')}>
        Artifacts
      </Button>
      {canPost && (
        <Button outline className="ml-auto" onClick={() => {
          onView('conversation')
          requestAnimationFrame(() => {
            const composer = document.querySelector<HTMLTextAreaElement>('textarea[aria-label="Write a message"]')
            composer?.scrollIntoView({ block: 'center', behavior: 'smooth' })
            composer?.focus({ preventScroll: true })
          })
        }}>
          Write a reply
        </Button>
      )}
    </div>
  )
}
