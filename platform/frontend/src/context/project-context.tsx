'use client'

import { getProjectBySlug, Project } from '@/service/api/project-api'
import { useParams } from 'next/navigation'
import { createContext, ReactNode, useContext, useEffect, useState } from 'react'

interface ProjectContextType {
  project: Project | null
  isLoading: boolean
  error: string | null
}

const ProjectContext = createContext<ProjectContextType | undefined>(undefined)

export function ProjectProvider({ children }: { children: ReactNode }) {
  const params = useParams()
  const projectSlug = params.project as string

  const [project, setProject] = useState<Project | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!projectSlug) {
      setProject(null)
      setIsLoading(false)
      return
    }

    async function fetchProject() {
      setIsLoading(true)
      try {
        const project = await getProjectBySlug(projectSlug)
        setProject(project)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch project')
      } finally {
        setIsLoading(false)
      }
    }

    fetchProject()
  }, [projectSlug])

  return <ProjectContext.Provider value={{ project, isLoading, error }}>{children}</ProjectContext.Provider>
}

export function useProject() {
  const context = useContext(ProjectContext)
  if (context === undefined) {
    throw new Error('useProject must be used within a ProjectProvider')
  }
  return context
}
