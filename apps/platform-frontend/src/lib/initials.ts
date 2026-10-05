/** "Maria Product" → "MP": up to two initials, for an avatar. */
export function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter((word) => /^[\p{L}\p{N}]/u.test(word))
    .map((word) => word[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase()
}
