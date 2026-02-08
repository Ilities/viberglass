import { Theme as RadixTheme } from '@radix-ui/themes'
import { ReactNode } from 'react'
import { useProject } from './project-context'
import { useTheme } from './theme-context'
import { getProjectAccentColor } from '@/lib/project-colors'

interface ProjectThemeProps {
  children: ReactNode
}

/**
 * Wraps children with a project-specific accent color.
 * Uses the project name to deterministically generate a unique accent color.
 * Falls back to the default theme accent color when no project is loaded.
 */
export function ProjectTheme({ children }: ProjectThemeProps) {
  const { project, isLoading } = useProject()
  const { theme } = useTheme()

  // While loading or if no project, render children without nested theme
  if (isLoading || !project) {
    return <>{children}</>
  }

  const projectAccentColor = getProjectAccentColor(project.name)

  return (
    <RadixTheme
      appearance={theme ?? 'light'}
      accentColor={projectAccentColor}
      grayColor="sand"
      radius="none"
      // Apply as a nested theme that inherits most settings but overrides accent
      asChild={false}
    >
      {children}
    </RadixTheme>
  )
}
