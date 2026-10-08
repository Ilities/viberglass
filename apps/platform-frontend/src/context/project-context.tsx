import { getProjectBySlug, Project } from '@/service/api/project-api'
import { useApiRefresh } from '@/hooks/useApiRefresh'
import { useParams } from 'react-router-dom'
import { createContext, ReactNode, useContext, useEffect, useRef, useState } from 'react'

interface ProjectContextType {
  project: Project | null
  isLoading: boolean
  error: string | null
}

const ProjectContext = createContext<ProjectContextType | undefined>(undefined)

export function ProjectProvider({ children }: { children: ReactNode }) {
  const params = useParams()
  const projectSlug = params.project
  const revision = useApiRefresh('/api/spaces')
  const loadedSlug = useRef<string | undefined>(undefined)

  const [project, setProject] = useState<Project | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!projectSlug) {
      loadedSlug.current = undefined
      setProject(null)
      setIsLoading(false)
      setError(null)
      return
    }
    const slug = projectSlug
    const changingSpace = loadedSlug.current !== slug
    let cancelled = false

    async function fetchProject() {
      setError(null)
      if (changingSpace) {
        setIsLoading(true)
        setProject(null)
      }
      try {
        const project = await getProjectBySlug(slug)
        if (cancelled) return
        loadedSlug.current = slug
        setProject(project)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to fetch space')
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    void fetchProject()
    return () => {
      cancelled = true
    }
  }, [projectSlug, revision])

  return <ProjectContext.Provider value={{ project, isLoading, error }}>{children}</ProjectContext.Provider>
}

export function useProject() {
  const context = useContext(ProjectContext)
  if (context === undefined) {
    throw new Error('useProject must be used within a ProjectProvider')
  }
  return context
}
