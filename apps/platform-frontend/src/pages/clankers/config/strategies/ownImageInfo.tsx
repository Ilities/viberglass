import { InfoCircledIcon } from '@radix-ui/react-icons'
import { Popover } from '@radix-ui/themes'

export function OwnImageInfo() {
  return (
    <Popover.Root>
      <Popover.Trigger>
        <button
          type="button"
          aria-label="Using your own worker image"
          className="rounded-full text-zinc-400 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300"
        >
          <InfoCircledIcon className="h-3.5 w-3.5" />
        </button>
      </Popover.Trigger>
      <Popover.Content size="1" maxWidth="360px" className="space-y-2 text-sm text-zinc-700 dark:text-zinc-300">
        <p>
          To run your own worker image, check out the repository and run{' '}
          <code>./infra/workers/scripts/build-workers.sh all</code>, then <code>push-workers.sh all</code>, with{' '}
          <code>VIBERATOR_WORKER_REGISTRY</code> set to the registry the backend pulls from.
        </p>
        <p>
          Leave <code>VIBERATOR_WORKER_REGISTRY</code> empty on the backend to use images built on the Docker host. Then
          choose Published image, or enter the image under Container Image.
        </p>
      </Popover.Content>
    </Popover.Root>
  )
}
