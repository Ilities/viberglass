import { Button } from '@/components/button'
import { FieldGroup, Fieldset } from '@/components/fieldset'
import { Heading } from '@/components/heading'
import { PageMeta } from '@/components/page-meta'
import { useProject } from '@/context/project-context'
import { IssueTrackerField } from './IssueTrackerField'
import { NO_SELECTION, RepositoryFields } from './RepositoryFields'
import { SpaceAdvancedSettings } from './SpaceAdvancedSettings'
import { useSpaceRepositoryForm } from './useSpaceRepositoryForm'

function Notice({ tone, children }: { tone: 'error' | 'success'; children: React.ReactNode }) {
  const colors =
    tone === 'error'
      ? 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400'
      : 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-300'
  return <div className={`mt-4 rounded-md p-4 text-sm ${colors}`}>{children}</div>
}

/** The code a space's agents work on, where its tasks live, and how pull requests are opened. */
export function SpaceRepositoryPage() {
  const { project } = useProject()
  const form = useSpaceRepositoryForm(project)

  if (!project) return null
  const connectionsHref = `/spaces/${project.slug}/settings/connections`

  return (
    <>
      <PageMeta title={`${project.name} | Repository`} />
      <div className="max-w-4xl">
        <Heading>Repository</Heading>

        {form.loadError && <Notice tone="error">{form.loadError}</Notice>}
        {form.error && <Notice tone="error">{form.error}</Notice>}
        {form.success && <Notice tone="success">{form.success}</Notice>}

        <form
          className="mt-8"
          onSubmit={(event) => {
            event.preventDefault()
            void form.save()
          }}
        >
          <Fieldset disabled={form.isSubmitting}>
            <FieldGroup className="space-y-8">
              <RepositoryFields
                codeHosts={form.codeHosts}
                codeHostId={form.codeHostId}
                onCodeHostChange={form.setCodeHostId}
                isLoadingCodeHosts={form.isLoadingConnections}
                connectionsHref={connectionsHref}
                repositoryAddress={form.repositoryAddress}
                onRepositoryAddressChange={form.setRepositoryAddress}
                defaultBranch={form.defaultBranch}
                onDefaultBranchChange={form.setDefaultBranch}
                tokens={form.tokens}
                tokenId={form.tokenId}
                onTokenChange={form.setTokenId}
                isLoadingTokens={form.isLoadingTokens}
                tokensError={form.tokensError}
              />

              <IssueTrackerField
                trackers={form.trackers}
                value={form.trackerId}
                onChange={form.setTrackerId}
                isLoading={form.isLoadingConnections}
                connectionsHref={connectionsHref}
              />

              <SpaceAdvancedSettings
                hasRepository={form.codeHostId !== NO_SELECTION}
                defaultBranch={form.defaultBranch}
                pullRequestRepository={form.pullRequestRepository}
                onPullRequestRepositoryChange={form.setPullRequestRepository}
                pullRequestBaseBranch={form.pullRequestBaseBranch}
                onPullRequestBaseBranchChange={form.setPullRequestBaseBranch}
                branchNameTemplate={form.branchNameTemplate}
                onBranchNameTemplateChange={form.setBranchNameTemplate}
                taskKeyExample={`${project.keyPrefix}-12`}
              />

              <div className="flex justify-end gap-4 border-t border-zinc-950/10 pt-8 dark:border-white/10">
                <Button type="button" outline onClick={form.reset}>
                  Reset
                </Button>
                <Button type="submit" color="brand" disabled={form.isSubmitting}>
                  {form.isSubmitting ? 'Saving…' : 'Save changes'}
                </Button>
              </div>
            </FieldGroup>
          </Fieldset>
        </form>
      </div>
    </>
  )
}
