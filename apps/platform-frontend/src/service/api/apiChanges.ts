type ApiChangeListener = (pathname: string) => void

const listeners = new Set<ApiChangeListener>()

export function subscribeApiChanges(listener: ApiChangeListener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function notifyApiChange(url: string): void {
  const pathname = new URL(url, window.location.origin).pathname
  for (const listener of listeners) listener(pathname)
}
