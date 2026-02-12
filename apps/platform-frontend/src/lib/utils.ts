import clsx from 'clsx'

/**
 * Utility function for merging class names with clsx
 */
export function cn(...inputs: (string | undefined | null | false | Record<string, boolean>)[]) {
  return clsx(...inputs)
}
