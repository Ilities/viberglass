import { AuthLayout } from '@/components/auth-layout'
import { ApplicationLayout } from '@/layouts/ApplicationLayout'
import { SettingsLayout } from '@/layouts/SettingsLayout'
import { SettingsHome, WorkspaceSettingsLayout } from '@/layouts/WorkspaceSettingsLayout'
import { Navigate, Route, Routes } from 'react-router-dom'

// Auth pages
import { ForgotPasswordPage } from '@/pages/auth/ForgotPasswordPage'
import { LoginPage } from '@/pages/auth/LoginPage'
import { RegisterPage } from '@/pages/auth/RegisterPage'
import { SetupPage } from '@/pages/setup/SetupPage'

// Main pages
import { DashboardPage } from '@/pages/DashboardPage'
import { NewProjectPage } from '@/pages/NewProjectPage'
import { NotFoundPage } from '@/pages/NotFoundPage'
import { SessionsPulsePage } from '@/pages/sessions/SessionsPulsePage'

// Clanker pages
import { ClankerDetailPage } from '@/pages/clankers/ClankerDetailPage'
import { ClankersPage } from '@/pages/clankers/ClankersPage'
import { EditClankerPage } from '@/pages/clankers/EditClankerPage'
import { NewClankerPage } from '@/pages/clankers/NewClankerPage'

// Project pages
import { ProjectHomePage } from '@/pages/project/ProjectHomePage'

// Tickets pages
import { CreateTicketPage } from '@/pages/project/tickets/CreateTicketPage'
import { TicketDetailPage } from '@/pages/project/tickets/TicketDetailPage'
import { TicketMediaPage } from '@/pages/project/tickets/TicketMediaPage'
import { TicketsPage } from '@/pages/project/tickets/TicketsPage'

// Jobs pages
import { JobDetailPage } from '@/pages/project/jobs/JobDetailPage'
import { JobsPage } from '@/pages/project/jobs/JobsPage'

// Claws pages
import { ClawsPage } from '@/pages/project/claws/ClawsPage'

// Sessions pages
import { SessionPage } from '@/pages/project/sessions/SessionPage'

// Prompt templates pages
import { PromptTemplatesPage as ProjectPromptTemplatesPage } from '@/pages/project/prompt-templates/PromptTemplatesPage'
import { PromptTemplatesPage } from '@/pages/settings/PromptTemplatesPage'

// Settings pages
import { ProjectIntegrationsPage } from '@/pages/project/settings/ProjectIntegrationsPage'
import { ProjectSettingsPage } from '@/pages/project/settings/ProjectSettingsPage'
import { SecretsPage } from '@/pages/secrets/SecretsPage'
import { ApiTokensPage } from '@/pages/settings/ApiTokensPage'
import { IntegrationDetailPage } from '@/pages/settings/IntegrationDetailPage'
import { IntegrationsPage } from '@/pages/settings/IntegrationsPage'
import { UsersPage } from '@/pages/settings/UsersPage'

export function AppRoutes() {
  return (
    <Routes>
      {/* Auth routes */}
      <Route element={<AuthLayout />}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        {/* First-run setup: same focused frame as sign-in, but signed in (admins only) */}
        <Route path="/setup" element={<SetupPage />} />
      </Route>

      {/* App routes (authenticated) */}
      <Route element={<ApplicationLayout />}>
        {/* Main routes */}
        <Route path="/" element={<DashboardPage />} />
        <Route path="/spaces/new" element={<NewProjectPage />} />
        <Route path="/pulse" element={<SessionsPulsePage />} />

        {/* Workspace settings: General, and the plumbing under Advanced. URLs stay put until Phase 2. */}
        <Route element={<WorkspaceSettingsLayout />}>
          <Route path="/settings" element={<SettingsHome />} />
          <Route path="/settings/agents" element={<ClankersPage />} />
          <Route path="/settings/agents/new" element={<NewClankerPage />} />
          <Route path="/settings/agents/:slug" element={<ClankerDetailPage />} />
          <Route path="/settings/agents/:slug/edit" element={<EditClankerPage />} />
          <Route path="/settings/secrets" element={<SecretsPage />} />
          <Route path="/settings/connections" element={<IntegrationsPage />} />
          <Route path="/settings/connections/new/:integrationSystem" element={<IntegrationDetailPage />} />
          <Route path="/settings/connections/:integrationEntityId" element={<IntegrationDetailPage />} />
          <Route path="/settings/members" element={<UsersPage />} />
          <Route path="/settings/prompt-templates" element={<PromptTemplatesPage />} />
          <Route path="/settings/api-tokens" element={<ApiTokensPage />} />
        </Route>

        {/* Project routes */}
        <Route path="/spaces/:project" element={<ProjectHomePage />} />

        {/* Project tickets */}
        <Route path="/spaces/:project/tasks" element={<TicketsPage />} />
        <Route path="/spaces/:project/tasks/new" element={<CreateTicketPage />} />
        <Route path="/spaces/:project/tasks/:id" element={<TicketDetailPage />} />
        <Route path="/spaces/:project/tasks/:id/media" element={<TicketMediaPage />} />

        {/* Project jobs */}
        <Route path="/spaces/:project/runs" element={<JobsPage />} />
        <Route path="/spaces/:project/runs/:jobId" element={<JobDetailPage />} />

        {/* Project claws */}
        <Route path="/spaces/:project/schedules" element={<ClawsPage />} />

        {/* Project sessions */}
        <Route path="/spaces/:project/sessions/:sessionId" element={<SessionPage />} />

        {/* Project settings with nested routes */}
        <Route path="/spaces/:project/settings" element={<SettingsLayout />}>
          <Route index element={<Navigate to="general" replace />} />
          <Route path="general" element={<ProjectSettingsPage />} />
          <Route path="connections" element={<ProjectIntegrationsPage />} />
          <Route path="prompt-templates" element={<ProjectPromptTemplatesPage />} />
        </Route>
      </Route>

      {/* 404 */}
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}
