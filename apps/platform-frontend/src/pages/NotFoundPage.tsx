import { Button } from '@/components/button'

export function NotFoundPage() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center text-center">
      <h1 className="text-4xl font-bold text-zinc-950 dark:text-white">404</h1>
      <p className="mt-2 text-zinc-500 dark:text-zinc-400">Page not found</p>
      <Button href="/" color="brand" className="mt-6">
        Go home
      </Button>
    </div>
  )
}
