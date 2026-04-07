import { Theme as RadixTheme } from '@radix-ui/themes'
import { ReactNode } from 'react'
import { useProject } from './project-context'
import { useTheme } from './theme-context'
import { getProjectAccentColor, getProjectGrayPalette } from '@/lib/project-colors'

interface ProjectThemeProps {
  children: ReactNode
}

/**
 * Wraps children with a project-specific accent color and gray palette.
 * Uses the project name to deterministically generate unique theme values.
 * Falls back to the default theme accent color when no project is loaded.
 */
export function ProjectTheme({ children }: ProjectThemeProps) {
  const { project } = useProject()
  const { theme } = useTheme()

  const projectAccentColor = project ? getProjectAccentColor(project.name) : undefined
  const projectGrayPalette = project ? getProjectGrayPalette(project.name) : undefined

  return (
    <RadixTheme
      appearance={theme ?? 'light'}
      {...(projectAccentColor ? { accentColor: projectAccentColor } : {})}
      {...(projectGrayPalette ? { grayColor: projectGrayPalette } : {})}
      radius="none"
      asChild={false}
    >
      {children}
    </RadixTheme>
  )
}
