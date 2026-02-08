/**
 * Generates a consistent accent color for a project based on its name.
 * Uses Radix UI's predefined accent colors which work in both light and dark modes.
 */

// Radix UI accent colors - curated for visual distinctiveness
// These all have good contrast in both light and dark modes
const ACCENT_COLORS = [
  'amber',
  'blue',
  'crimson',
  'cyan',
  'gold',
  'grass',
  'green',
  'indigo',
  'iris',
  'jade',
  'lime',
  'mint',
  'orange',
  'pink',
  'plum',
  'purple',
  'ruby',
  'sky',
  'teal',
  'tomato',
  'violet',
  'yellow',
] as const

export type AccentColor = (typeof ACCENT_COLORS)[number]

/**
 * Simple hash function for strings.
 * Returns a consistent number for a given string.
 */
function hashString(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = (hash << 5) - hash + char
    hash = hash & hash // Convert to 32-bit integer
  }
  return Math.abs(hash)
}

/**
 * Gets a consistent accent color for a project based on its name.
 * The same project name will always return the same color.
 */
export function getProjectAccentColor(projectName: string): AccentColor {
  const hash = hashString(projectName.toLowerCase().trim())
  const index = hash % ACCENT_COLORS.length
  return ACCENT_COLORS[index]
}

/**
 * Gets all available accent colors.
 */
export function getAvailableAccentColors(): readonly AccentColor[] {
  return ACCENT_COLORS
}
