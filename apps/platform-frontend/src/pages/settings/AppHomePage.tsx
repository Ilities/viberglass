import { Button } from '@/components/button'
import { Description, Field, FieldGroup, Fieldset, Label } from '@/components/fieldset'
import { Heading, Subheading } from '@/components/heading'
import { Link } from '@/components/link'
import { PageMeta } from '@/components/page-meta'
import { Select } from '@/components/select'
import { Text } from '@/components/text'
import { NO_SELECTION } from '@/pages/project/settings/RepositoryFields'
import { useWorkspaceConnections } from '@/pages/project/settings/useWorkspaceConnections'
import { gitHubTokenUrl } from '@/lib/repositoryAddress'
import { getAppHome, removeAppHome, saveAppHome } from '@/service/api/app-home-api'
import type { AppHomeStatus, AppSpaceRequirement } from '@viberglass/types'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { useRepositoryOwners } from './useRepositoryOwners'

const DEFAULT_TOKEN = '__default__'

const REQUIREMENTS: Record<AppSpaceRequirement, string> = {
  apps_domain: 'An apps domain. Set APPS_DOMAIN to the wildcard domain apps are served under, such as apps.example.com.',
  object_storage: 'Object storage, where app data and releases are kept. Set S3_BUCKET.',
  app_host: "Somewhere to run apps. On Kubernetes, set KUBERNETES_APPS_NAMESPACE (the chart does when apps.domain is set). On AWS, set appsDomain in the platform stack.",
  app_home: 'An App home, chosen below.',
}

/** Where App spaces' repositories are created, and what else the workspace needs before App spaces are offered. */
export function AppHomePage() {
  const [status, setStatus] = useState<AppHomeStatus | null>(null)
  const [codeHostId, setCodeHostId] = useState(NO_SELECTION)
  const [tokenId, setTokenId] = useState(DEFAULT_TOKEN)
  const [owner, setOwner] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const connections = useWorkspaceConnections(codeHostId)
  const codeHosts = connections.codeHosts.filter((codeHost) => codeHost.createsRepositories)
  const credentialId = tokenId === DEFAULT_TOKEN ? null : tokenId
  const owners = useRepositoryOwners(codeHostId === NO_SELECTION ? null : codeHostId, credentialId)
  const hasDefaultToken = connections.tokens.some((token) => token.isDefault)

  useEffect(() => {
    getAppHome()
      .then((loaded) => {
        setStatus(loaded)
        if (!loaded.home) return
        setCodeHostId(loaded.home.integrationId)
        setTokenId(loaded.home.credentialId ?? DEFAULT_TOKEN)
        setOwner(loaded.home.owner)
      })
      .catch((error: unknown) => toast.error(error instanceof Error ? error.message : "Couldn't load the App home"))
  }, [])

  useEffect(() => {
    if (tokenId === DEFAULT_TOKEN && !hasDefaultToken && connections.tokens.length > 0) setTokenId(connections.tokens[0].id)
  }, [tokenId, hasDefaultToken, connections.tokens])

  useEffect(() => {
    if (owners.list.length > 0 && !owners.list.some((candidate) => candidate.name === owner)) setOwner(owners.list[0].name)
  }, [owners.list, owner])

  function chooseCodeHost(id: string) {
    if (!id) return
    setCodeHostId(id)
    setTokenId(DEFAULT_TOKEN)
  }

  async function change(work: () => Promise<AppHomeStatus>, done: string) {
    setIsSaving(true)
    try {
      setStatus(await work())
      toast.success(done)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't change the App home")
    } finally {
      setIsSaving(false)
    }
  }

  function handleSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void change(() => saveAppHome({ integrationId: codeHostId, credentialId, owner }), 'App home saved')
  }

  function handleRemove() {
    void change(async () => {
      const removed = await removeAppHome()
      setCodeHostId(NO_SELECTION)
      setTokenId(DEFAULT_TOKEN)
      setOwner('')
      return removed
    }, 'App home removed')
  }

  const missing = status?.availability.missing ?? []

  return (
    <>
      <PageMeta title="Apps" />
      <div className="max-w-2xl py-6">
        <Heading>Apps</Heading>
        <Text className="!mt-2">
          An App space builds one app for your team, and Viberglass runs it. Each App space’s code lives in a private
          repository that Viberglass creates in the App home.
        </Text>

        {status && (status.availability.available ? (
          <Text className="!mt-4">App spaces are offered when people create a space.</Text>
        ) : (
          <div className="mt-4 text-sm/6 text-zinc-700 dark:text-zinc-300">
            <p>App spaces aren’t offered yet. This workspace still needs:</p>
            <ul className="mt-2 list-disc pl-5">
              {missing.map((requirement) => <li key={requirement}>{REQUIREMENTS[requirement]}</li>)}
            </ul>
          </div>
        ))}

        <form className="mt-10" onSubmit={handleSave}>
          <Subheading>App home</Subheading>
          <Fieldset disabled={isSaving || !status}>
            <FieldGroup className="mt-6 space-y-6">
              <Field>
                <Label>Code host</Label>
                <Select value={codeHostId} onChange={chooseCodeHost}>
                  <option value={NO_SELECTION}>{connections.isLoading ? 'Loading…' : 'Choose a connection'}</option>
                  {codeHosts.map((codeHost) => <option key={codeHost.id} value={codeHost.id}>{codeHost.label}</option>)}
                </Select>
                {!connections.isLoading && codeHosts.length === 0 && (
                  <Description className="mt-2">
                    <Link href="/settings/connections" className="text-[var(--accent-11)] underline underline-offset-2">
                      Connect GitHub
                    </Link>{' '}
                    with a token that can create repositories.{' '}
                    <a
                      href={gitHubTokenUrl('', { createsRepositories: true })}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[var(--accent-11)] underline underline-offset-2"
                    >
                      Create one on GitHub
                    </a>{' '}
                    with access to All repositories.
                  </Description>
                )}
              </Field>
              <Field>
                <Label>Access token</Label>
                <Description>Creates the repositories, and agents push to them with it.</Description>
                <Select value={tokenId} onChange={(next) => next && setTokenId(next)} disabled={isSaving || codeHostId === NO_SELECTION}>
                  {(hasDefaultToken || connections.tokens.length === 0) && (
                    <option value={DEFAULT_TOKEN}>The connection’s default token</option>
                  )}
                  {connections.tokens.map((token) => <option key={token.id} value={token.id}>{token.name}</option>)}
                </Select>
              </Field>
              <Field>
                <Label>Owner</Label>
                <Description>The account or organisation the repositories belong to.</Description>
                <Select
                  value={owner}
                  onChange={(next) => next && setOwner(next)}
                  disabled={isSaving || owners.list.length === 0}
                  placeholder={owners.isLoading ? 'Loading…' : codeHostId === NO_SELECTION ? 'Choose a code host first' : 'No owners'}
                >
                  {owners.list.map((candidate) => <option key={candidate.name} value={candidate.name}>{candidate.name}</option>)}
                </Select>
                {owners.error && <Description className="mt-2 text-red-600 dark:text-red-400">{owners.error}</Description>}
              </Field>
              <div className="flex justify-end gap-4 border-t border-zinc-950/10 pt-6 dark:border-white/10">
                {status?.home && <Button type="button" outline onClick={handleRemove}>Remove App home</Button>}
                <Button type="submit" color="brand" disabled={codeHostId === NO_SELECTION || !owner}>
                  {isSaving ? 'Saving…' : 'Save'}
                </Button>
              </div>
            </FieldGroup>
          </Fieldset>
        </form>
      </div>
    </>
  )
}
