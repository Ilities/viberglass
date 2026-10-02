import { AuthLayout } from '@/components/auth-layout'
import { ApplicationLayout } from '@/layouts/ApplicationLayout'
import { RunnersOnly } from '@/layouts/RunnersOnly'
import { SettingsLayout } from '@/layouts/SettingsLayout'
import { SettingsHome, WorkspaceSettingsLayout } from '@/layouts/WorkspaceSettingsLayout'
import { Navigate, Route, Routes } from 'react-router-dom'

// Auth pages
import { ForgotPasswordPage } from '@/pages/auth/ForgotPasswordPage'
import { AcceptInvitePage } from '@/pages/auth/AcceptInvitePage'
import { ResetPasswordPage } from '@/pages/auth/ResetPasswordPage'
import { LoginPage } from '@/pages/auth/LoginPage'
import { RegisterPage } from '@/pages/auth/RegisterPage'
import { SetupPage } from '@/pages/setup/SetupPage'

// Main pages
import { HomePage } from '@/pages/home/HomePage'
import { OverviewPage } from '@/pages/overview/OverviewPage'
import { NewProjectPage } from '@/pages/NewProjectPage'
import { NotFoundPage } from '@/pages/NotFoundPage'

// Clanker pages
import { ClankerDetailPage } from '@/pages/clankers/ClankerDetailPage'
import { ClankersPage } from '@/pages/clankers/ClankersPage'
import { EditClankerPage } from '@/pages/clankers/EditClankerPage'
import { NewClankerPage } from '@/pages/clankers/NewClankerPage'

// Space pages
import { SpacePage } from '@/pages/project/space/SpacePage'

// Tickets pages
import { CreateTicketPage } from '@/pages/project/tickets/CreateTicketPage'
import { TicketDetailPage } from '@/pages/project/tickets/TicketDetailPage'
import { TicketMediaPage } from '@/pages/project/tickets/TicketMediaPage'

// Jobs pages
import { JobDetailPage } from '@/pages/project/jobs/JobDetailPage'
import { JobsPage } from '@/pages/project/jobs/JobsPage'

// Claws pages
import { ClawsPage } from '@/pages/project/claws/ClawsPage'

// Prompt templates pages
import { PromptTemplatesPage as ProjectPromptTemplatesPage } from '@/pages/project/prompt-templates/PromptTemplatesPage'
import { PromptTemplatesPage } from '@/pages/settings/PromptTemplatesPage'

// Settings pages
import { ProjectIntegrationsPage } from '@/pages/project/settings/ProjectIntegrationsPage'
import { SpaceGeneralSettings } from '@/pages/project/settings/AboutSpacePage'
import { SpaceMembersPage } from '@/pages/project/settings/SpaceMembersPage'
import { SecretsPage } from '@/pages/secrets/SecretsPage'
import { ApiTokensPage } from '@/pages/settings/ApiTokensPage'
import { IntegrationDetailPage } from '@/pages/settings/IntegrationDetailPage'
import { IntegrationsPage } from '@/pages/settings/IntegrationsPage'
import { UsersPage } from '@/pages/settings/UsersPage'
import { NotificationSettingsPage } from '@/pages/settings/NotificationSettingsPage'
import { RunRecordsPage } from '@/pages/settings/run-records/RunRecordsPage'
import { AuditLogPage } from '@/pages/settings/audit-log/AuditLogPage'

export function AppRoutes() {
  return (
    <Routes>
      {/* Auth routes */}
      <Route element={<AuthLayout />}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/invite/:token" element={<AcceptInvitePage />} />
        <Route path="/reset-password/:token" element={<ResetPasswordPage />} />
        {/* First-run setup: same focused frame as sign-in, but signed in (admins only) */}
        <Route path="/setup" element={<SetupPage />} />
      </Route>

      {/* App routes (authenticated) */}
      <Route element={<ApplicationLayout />}>
        {/* Main routes */}
        <Route path="/" element={<HomePage />} />
        <Route path="/overview" element={<OverviewPage />} />
        <Route path="/spaces/new" element={<NewProjectPage />} />

        {/* Workspace settings: General, and the plumbing under Advanced. */}
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
          <Route path="/settings/notifications" element={<NotificationSettingsPage />} />
          <Route path="/settings/prompt-templates" element={<PromptTemplatesPage />} />
          <Route path="/settings/api-tokens" element={<ApiTokensPage />} />
          <Route path="/settings/run-records" element={<RunRecordsPage />} />
          <Route path="/settings/audit-log" element={<AuditLogPage />} />
        </Route>

        {/* A space is its tasks */}
        <Route path="/spaces/:project" element={<SpacePage />} />
        <Route path="/spaces/:project/tasks/:id" element={<TicketDetailPage />} />
        <Route path="/spaces/:project/tasks/:id/media" element={<TicketMediaPage />} />

        {/* Only for those who run agents */}
        <Route element={<RunnersOnly />}>
          <Route path="/spaces/:project/tasks/new" element={<CreateTicketPage />} />
          <Route path="/spaces/:project/runs" element={<JobsPage />} />
          <Route path="/spaces/:project/runs/:jobId" element={<JobDetailPage />} />
          <Route path="/spaces/:project/schedules" element={<ClawsPage />} />
        </Route>

        {/* Project settings with nested routes */}
        <Route path="/spaces/:project/settings" element={<SettingsLayout />}>
          <Route index element={<Navigate to="general" replace />} />
          <Route path="general" element={<SpaceGeneralSettings />} />
          <Route path="members" element={<SpaceMembersPage />} />
          <Route path="connections" element={<ProjectIntegrationsPage />} />
          <Route path="prompt-templates" element={<ProjectPromptTemplatesPage />} />
        </Route>
      </Route>

      {/* 404 */}
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}
