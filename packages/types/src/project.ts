/**
 * Project-related types
 */

import { TicketSystem } from './common'

// Authentication credential types
export type AuthCredentialType = 'api_key' | 'oauth' | 'basic' | 'token'

// Flexible authentication credentials for different systems
export interface AuthCredentials {
  type: AuthCredentialType
  apiKey?: string
  username?: string
  password?: string
  token?: string
  clientId?: string
  clientSecret?: string
  refreshToken?: string
  baseUrl?: string // For on-premise installations
}

// Project configuration
export interface Project {
  id: string
  name: string
  slug: string
  ticketSystem: TicketSystem
  credentials: AuthCredentials
  webhookUrl?: string | null
  autoFixEnabled: boolean
  autoFixTags: string[]
  customFieldMappings: Record<string, string>
  repositoryUrl?: string | null
  createdAt: string
  updatedAt: string
}

// Request body for creating a project
export interface CreateProjectRequest {
  name: string
  ticketSystem: TicketSystem
  credentials: AuthCredentials
  webhookUrl?: string | null
  autoFixEnabled?: boolean
  autoFixTags?: string[]
  customFieldMappings?: Record<string, string>
  repositoryUrl?: string | null
}

// Request body for updating a project
export interface UpdateProjectRequest {
  name?: string
  ticketSystem?: TicketSystem
  credentials?: AuthCredentials
  webhookUrl?: string | null
  autoFixEnabled?: boolean
  autoFixTags?: string[]
  customFieldMappings?: Record<string, string>
  repositoryUrl?: string | null
}

// Project summary for list views
export interface ProjectSummary {
  id: string
  name: string
  slug: string
  ticketSystem: TicketSystem
  autoFixEnabled: boolean
  repositoryUrl?: string | null
  createdAt: string
  updatedAt: string
  // Stats (computed on frontend or via separate endpoint)
  stats?: {
    openBugs: number
    resolvedThisWeek: number
    autoFixRequests: number
  }
}
