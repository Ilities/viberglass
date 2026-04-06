import { AuthLayout } from '@/components/auth-layout'
import { ApplicationLayout } from '@/layouts/ApplicationLayout'
import { SettingsLayout } from '@/layouts/SettingsLayout'
import { Navigate, Route, Routes } from 'react-router-dom'

// Auth pages
import { ForgotPasswordPage } from '@/pages/auth/ForgotPasswordPage'
import { LoginPage } from '@/pages/auth/LoginPage'
import { RegisterPage } from '@/pages/auth/RegisterPage'

// Main pages
import { DashboardPage } from '@/pages/DashboardPage'
import { NewProjectPage } from '@/pages/NewProjectPage'
import { NotFoundPage } from '@/pages/NotFoundPage'

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
      </Route>

      {/* App routes (authenticated) */}
      <Route element={<ApplicationLayout />}>
        {/* Main routes */}
        <Route path="/" element={<DashboardPage />} />
        <Route path="/new" element={<NewProjectPage />} />

        {/* Clankers */}
        <Route path="/clankers" element={<ClankersPage />} />
        <Route path="/clankers/new" element={<NewClankerPage />} />
        <Route path="/clankers/:slug" element={<ClankerDetailPage />} />
        <Route path="/clankers/:slug/edit" element={<EditClankerPage />} />

        {/* Secrets */}
        <Route path="/secrets" element={<SecretsPage />} />

        {/* Settings */}
        <Route path="/settings/integrations" element={<IntegrationsPage />} />
        <Route path="/settings/integrations/new/:integrationSystem" element={<IntegrationDetailPage />} />
        <Route path="/settings/integrations/:integrationEntityId" element={<IntegrationDetailPage />} />
        <Route path="/settings/users" element={<UsersPage />} />
        <Route path="/settings/prompt-templates" element={<PromptTemplatesPage />} />

        {/* Project routes */}
        <Route path="/project/:project" element={<ProjectHomePage />} />

        {/* Project tickets */}
        <Route path="/project/:project/tickets" element={<TicketsPage />} />
        <Route path="/project/:project/tickets/create" element={<CreateTicketPage />} />
        <Route path="/project/:project/tickets/:id" element={<TicketDetailPage />} />
        <Route path="/project/:project/tickets/:id/media" element={<TicketMediaPage />} />

        {/* Project jobs */}
        <Route path="/project/:project/jobs" element={<JobsPage />} />
        <Route path="/project/:project/jobs/:jobId" element={<JobDetailPage />} />

        {/* Project claws */}
        <Route path="/project/:project/claws" element={<ClawsPage />} />

        {/* Project sessions */}
        <Route path="/project/:project/sessions/:sessionId" element={<SessionPage />} />

        {/* Project settings with nested routes */}
        <Route path="/project/:project/settings" element={<SettingsLayout />}>
          <Route index element={<Navigate to="project" replace />} />
          <Route path="project" element={<ProjectSettingsPage />} />
          <Route path="integrations" element={<ProjectIntegrationsPage />} />
          <Route path="prompt-templates" element={<ProjectPromptTemplatesPage />} />
        </Route>
      </Route>

      {/* 404 */}
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}
