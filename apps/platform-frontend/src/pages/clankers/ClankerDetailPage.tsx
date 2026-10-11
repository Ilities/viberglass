import { Avatar } from '@/components/avatar'
import { Badge } from '@/components/badge'
import { Breadcrumbs } from '@/components/breadcrumbs'
import { Heading, Subheading } from '@/components/heading'
import { InfoItem } from '@/components/info-item'
import { PageMeta } from '@/components/page-meta'
import { Section } from '@/components/section'
import { formatDeploymentStrategy, getClankerBySlug } from '@/data'
import { useAuth } from '@/context/auth-context'
import type { Secret } from '@/service/api/secret-api'
import { getSecret } from '@/service/api/secret-api'
import { CalendarIcon, ClockIcon, StackIcon } from '@radix-ui/react-icons'
import { getAgentLabel, isObjectRecord, type Clanker, type ModelEndpoint } from '@viberglass/types'
import { listModelEndpoints } from '@/service/api/model-endpoint-api'
import { TextLink } from '@/components/text'
import { useCallback, useEffect, useState } from 'react'
import { RunnerInstructionsAndTools } from './runner-instructions-and-tools'
import { useParams } from 'react-router-dom'
import { ClankerActions } from './clanker-actions'
import { ChatGptLoginCard } from './chatgpt-login-card'
import { summarizeRunner } from './config/runnerSummary'
import { RunnerReadinessBadge } from '@/components/runner-readiness-badge'
import { Timestamp } from '@/components/timestamp'

/** The latest run is what shows the credential works: nothing proves it until one finishes. */
function LastRun({ readiness }: { readiness: Clanker['readiness'] }) {
  const lastRun = readiness?.lastRun
  if (!lastRun) return <span className="text-[var(--gray-10)]">None yet. The first task run checks the key and model.</span>
  return (
    <>
      {lastRun.status === 'completed' ? 'Succeeded' : `Failed${lastRun.failureTitle ? `: ${lastRun.failureTitle}` : ''}`} · <Timestamp date={lastRun.at} />
    </>
  )
}

function formatAgent(agent?: Clanker['agent'] | null): string {
  return getAgentLabel(agent)
}

/**
 * The one line on what stops the agent. Compute progress and failures carry their own message;
 * an admin, who has the Start button, isn't told that an admin can start it.
 */
function statusLine(clanker: Clanker, fallback: string | null, isAdmin: boolean): string | null {
  if ((clanker.status === 'deploying' || clanker.status === 'failed') && clanker.statusMessage) return clanker.statusMessage
  if (isAdmin && clanker.status === 'inactive' && clanker.readiness?.state === 'not_running') return null
  return clanker.readiness?.problem ?? fallback
}

function formatConfigValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return 'Not configured'
  if (typeof value === 'string') return value
  return JSON.stringify(value)
}

function formatBytes(value: unknown): string {
  if (typeof value !== 'number' || Number.isNaN(value) || value < 0) {
    return 'Not available'
  }

  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let size = value
  let unitIndex = 0

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024
    unitIndex += 1
  }

  return `${size.toFixed(size >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`
}

function formatDateTime(value: unknown): string {
  if (!value || typeof value !== 'string') return 'Not available'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleString()
}

function formatDurationMs(value: unknown): string {
  if (typeof value !== 'number' || Number.isNaN(value) || value < 0) {
    return 'Not available'
  }

  const seconds = Math.round(value / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  return `${minutes}m ${remainingSeconds}s`
}

function readStrategyName(
  strategyConfig: Record<string, unknown> | null,
  fallback?: string | null
): 'docker' | 'ecs' | 'lambda' | null {
  const type = typeof strategyConfig?.type === 'string' ? strategyConfig.type.toLowerCase() : ''
  if (type === 'docker') return 'docker'
  if (type === 'ecs') return 'ecs'
  if (type === 'lambda') return 'lambda'

  const normalizedFallback = (fallback || '').toLowerCase()
  if (normalizedFallback === 'docker') return 'docker'
  if (normalizedFallback === 'ecs') return 'ecs'
  if (normalizedFallback === 'aws-lambda-container' || normalizedFallback === 'lambda') return 'lambda'
  return null
}

export function ClankerDetailPage() {
  const { slug } = useParams<{ slug: string }>()
  const [clanker, setClanker] = useState<Clanker | null>(null)
  const [secrets, setSecrets] = useState<Secret[]>([])
  const [endpoints, setEndpoints] = useState<ModelEndpoint[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const isAdmin = useAuth().user?.role === 'admin'

  const loadData = useCallback(async () => {
    if (!slug) {
      setIsLoading(false)
      return
    }

    try {
      const clankerData = await getClankerBySlug(slug)
      if (!clankerData) return

      const loginSecretId = summarizeRunner(clankerData, []).loginSecretId
      const endpointList = clankerData.modelEndpoint ? await listModelEndpoints().catch(() => []) : []
      const endpointSecretId = endpointList.find((endpoint) => endpoint.id === clankerData.modelEndpoint?.endpointId)?.secretId
      const secretIds = [
        ...(clankerData.secretBindings || []).map((binding) => binding.secretId),
        ...(loginSecretId ? [loginSecretId] : []),
        ...(endpointSecretId ? [endpointSecretId] : []),
      ]
      const secretResults = await Promise.all(
        secretIds.map(async (secretId) => {
          try {
            return await getSecret(secretId)
          } catch (error) {
            console.error(`Failed to fetch secret ${secretId}:`, error)
            return null
          }
        }),
      ).then((results) => results.filter((secret): secret is Secret => secret !== null))

      setClanker(clankerData)
      setSecrets(secretResults)
      setEndpoints(endpointList)
    } finally {
      setIsLoading(false)
    }
  }, [slug])

  useEffect(() => {
    void loadData()
  }, [loadData])

  useEffect(() => {
    if (!slug || !clanker || clanker.status !== 'deploying') {
      return
    }

    const intervalId = window.setInterval(() => {
      void getClankerBySlug(slug)
        .then((latest) => {
          setClanker(latest)
        })
        .catch((error) => {
          console.error('Failed to poll agent status:', error)
        })
    }, 3000)

    return () => window.clearInterval(intervalId)
  }, [slug, clanker])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-[var(--gray-9)]">Loading agent...</div>
      </div>
    )
  }

  if (!clanker) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-red-600 dark:text-red-400">Agent not found</div>
      </div>
    )
  }

  const summary = summarizeRunner(clanker, secrets, endpoints)
  const status = statusLine(clanker, summary.problem, isAdmin)
  const deploymentConfig = isObjectRecord(clanker.deploymentConfig) ? clanker.deploymentConfig : null
  const v1Strategy = isObjectRecord(deploymentConfig?.strategy) ? deploymentConfig.strategy : null
  const strategyConfig = deploymentConfig?.version === 1 && v1Strategy ? v1Strategy : deploymentConfig
  const deploymentDetails: Array<{ label: string; value: string }> = []
  let dockerBuildLogs: string[] = []
  const strategyName = readStrategyName(strategyConfig, clanker.deploymentStrategy?.name)

  if (strategyName === 'docker' && strategyConfig) {
    const imageMetadata = isObjectRecord(strategyConfig.imageMetadata) ? strategyConfig.imageMetadata : {}
    const dockerBuild = isObjectRecord(strategyConfig.dockerBuild) ? strategyConfig.dockerBuild : {}
    const rawLogs = dockerBuild.logs

    deploymentDetails.push({
      label: 'Container Image',
      value: formatConfigValue(strategyConfig.containerImage),
    })
    deploymentDetails.push({
      label: 'Image ID',
      value: formatConfigValue(imageMetadata.imageId),
    })
    deploymentDetails.push({
      label: 'Image Created',
      value: formatDateTime(imageMetadata.createdAt),
    })
    deploymentDetails.push({
      label: 'Image Size',
      value: formatBytes(imageMetadata.sizeBytes),
    })
    deploymentDetails.push({
      label: 'Virtual Size',
      value: formatBytes(imageMetadata.virtualSizeBytes),
    })
    deploymentDetails.push({
      label: 'Architecture',
      value: formatConfigValue(imageMetadata.architecture),
    })
    deploymentDetails.push({
      label: 'OS',
      value: formatConfigValue(imageMetadata.os),
    })
    deploymentDetails.push({
      label: 'Build Started',
      value: formatDateTime(dockerBuild.startedAt),
    })
    deploymentDetails.push({
      label: 'Build Completed',
      value: formatDateTime(dockerBuild.completedAt),
    })
    deploymentDetails.push({
      label: 'Build Duration',
      value: formatDurationMs(dockerBuild.durationMs),
    })

    if (Array.isArray(rawLogs)) {
      dockerBuildLogs = rawLogs.filter((line): line is string => typeof line === 'string').slice(-80)
    }
  }

  if (strategyName === 'ecs' && strategyConfig) {
    const taskDefinitionDetails = isObjectRecord(strategyConfig.taskDefinitionDetails)
      ? strategyConfig.taskDefinitionDetails
      : {}
    const containerImages = Array.isArray(taskDefinitionDetails.containerImages)
      ? taskDefinitionDetails.containerImages.filter((item): item is Record<string, unknown> => isObjectRecord(item))
      : []

    deploymentDetails.push({
      label: 'Cluster ARN',
      value: formatConfigValue(strategyConfig.clusterArn),
    })
    deploymentDetails.push({
      label: 'Task Definition ARN',
      value: formatConfigValue(strategyConfig.taskDefinitionArn),
    })
    deploymentDetails.push({
      label: 'Task Family',
      value: formatConfigValue(taskDefinitionDetails.family),
    })
    deploymentDetails.push({
      label: 'Task Revision',
      value: formatConfigValue(taskDefinitionDetails.revision),
    })
    deploymentDetails.push({
      label: 'Task Status',
      value: formatConfigValue(taskDefinitionDetails.status),
    })
    deploymentDetails.push({
      label: 'Registered At',
      value: formatDateTime(taskDefinitionDetails.registeredAt),
    })
    deploymentDetails.push({
      label: 'CPU',
      value: formatConfigValue(taskDefinitionDetails.cpu),
    })
    deploymentDetails.push({
      label: 'Memory',
      value: formatConfigValue(taskDefinitionDetails.memory),
    })
    if (containerImages.length > 0) {
      deploymentDetails.push({
        label: 'Container Images',
        value: containerImages
          .map((container) => {
            const name = typeof container.name === 'string' ? container.name : 'container'
            const image = typeof container.image === 'string' ? container.image : 'unknown'
            return `${name}: ${image}`
          })
          .join('\n'),
      })
    }
  }

  if (strategyName === 'lambda' && strategyConfig) {
    const functionDetails = isObjectRecord(strategyConfig.functionDetails) ? strategyConfig.functionDetails : {}

    deploymentDetails.push({
      label: 'Function Name',
      value: formatConfigValue(strategyConfig.functionName),
    })
    deploymentDetails.push({
      label: 'Function ARN',
      value: formatConfigValue(strategyConfig.functionArn),
    })
    deploymentDetails.push({
      label: 'Image URI',
      value: formatConfigValue(functionDetails.imageUri ?? strategyConfig.imageUri),
    })
    deploymentDetails.push({
      label: 'Version',
      value: formatConfigValue(functionDetails.version),
    })
    deploymentDetails.push({
      label: 'State',
      value: formatConfigValue(functionDetails.state),
    })
    deploymentDetails.push({
      label: 'Last Modified',
      value: formatDateTime(functionDetails.lastModified),
    })
    deploymentDetails.push({
      label: 'Memory Size',
      value:
        typeof functionDetails.memorySize === 'number'
          ? `${functionDetails.memorySize} MB`
          : formatConfigValue(functionDetails.memorySize),
    })
    deploymentDetails.push({
      label: 'Timeout',
      value:
        typeof functionDetails.timeout === 'number'
          ? `${functionDetails.timeout}s`
          : formatConfigValue(functionDetails.timeout),
    })
  }

  return (
    <>
      <PageMeta title={`${clanker.name} | Agent`} />
      <div className="flex h-full flex-col">
        <Breadcrumbs
          items={[
            { label: 'Agents', href: '/settings/agents' },
            { label: clanker.name },
          ]}
        />

        <div className="mb-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-4">
              <Avatar
                square
                initials={clanker.name.substring(0, 2).toUpperCase()}
                className="bg-brand-gradient size-14 text-lg text-brand-charcoal shadow-sm"
              />

              <div>
                <Heading className="text-2xl">{clanker.name}</Heading>
                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                  <RunnerReadinessBadge readiness={clanker.readiness} />
                  <Badge color="blue">{formatDeploymentStrategy(clanker.deploymentStrategy)}</Badge>
                  <Badge color="violet">{formatAgent(clanker.agent)}</Badge>
                </div>
                {clanker.description && <p className="mt-2 text-sm text-[var(--gray-9)]">{clanker.description}</p>}
              </div>
            </div>

            {isAdmin && (
              <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                <ClankerActions clanker={clanker} onClankerUpdated={setClanker} />
              </div>
            )}
          </div>
        </div>

        <div className="min-h-0 flex-1">
          <div className="grid h-full gap-6 lg:grid-cols-12">
            <div className="space-y-1 lg:col-span-4 xl:col-span-3">
              <div className="app-frame rounded-lg p-4">
                <Section title="Details">
                  <InfoItem
                    icon={<StackIcon className="h-4 w-4" />}
                    label="Slug"
                    value={<span className="font-mono text-xs break-all whitespace-normal">{clanker.slug}</span>}
                  />
                  <div className="mx-1 h-px bg-[var(--gray-6)]" />
                  <InfoItem
                    icon={<CalendarIcon className="h-4 w-4" />}
                    label="Created"
                    value={<Timestamp date={clanker.createdAt} />}
                  />
                  <div className="mx-1 h-px bg-[var(--gray-6)]" />
                  <InfoItem
                    icon={<ClockIcon className="h-4 w-4" />}
                    label="Updated"
                    value={<Timestamp date={clanker.updatedAt} />}
                  />
                </Section>
              </div>
            </div>

            <div className="space-y-6 lg:col-span-8 xl:col-span-9">
              <div className="app-frame rounded-lg p-6">
                <Subheading className="mb-4">Setup</Subheading>
                {status && (
                  <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300">
                    {status}
                  </div>
                )}
                <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-[max-content_1fr]">
                  <dt className="text-sm text-[var(--gray-9)]">Agent</dt>
                  <dd className="text-sm text-[var(--gray-12)]">{formatAgent(clanker.agent)}</dd>
                  <dt className="text-sm text-[var(--gray-9)]">Provider</dt>
                  <dd className="text-sm text-[var(--gray-12)]">
                    {summary.endpoint ? (
                      <>
                        <TextLink href="/settings/models">{summary.endpoint.name}</TextLink>
                        <span className="ml-2 font-mono text-xs text-[var(--gray-9)]">{summary.endpoint.host}</span>
                      </>
                    ) : summary.usesChatGptLogin
                      ? 'OpenAI (ChatGPT login)'
                      : summary.customEndpoint
                        ? `${summary.providerLabel ?? 'Unknown'} key, sent to a custom endpoint`
                        : (summary.providerLabel ?? 'Not set')}
                  </dd>
                  {summary.customEndpoint && (
                    <>
                      <dt className="text-sm text-[var(--gray-9)]">Endpoint</dt>
                      <dd className="text-sm text-[var(--gray-12)]">
                        {summary.customEndpoint.url ? (
                          <span className="font-mono text-xs">{summary.customEndpoint.url}</span>
                        ) : (
                          <>
                            Set by <span className="font-mono text-xs">{summary.customEndpoint.envVar}</span>
                          </>
                        )}
                        <p className="text-xs text-[var(--gray-10)]">
                          The endpoint decides which model actually runs; this isn&apos;t a verified {summary.providerLabel ?? 'provider'} model.
                        </p>
                      </dd>
                    </>
                  )}
                  <dt className="text-sm text-[var(--gray-9)]">Model</dt>
                  <dd className="text-sm text-[var(--gray-12)]">
                    {summary.model || "The agent's default"}
                  </dd>
                  <dt className="text-sm text-[var(--gray-9)]">Last run</dt>
                  <dd className="text-sm text-[var(--gray-12)]">
                    <LastRun readiness={clanker.readiness} />
                  </dd>
                  <dt className="text-sm text-[var(--gray-9)]">Key</dt>
                  <dd className="text-sm text-[var(--gray-12)]">
                    {summary.usesChatGptLogin ? (
                      'ChatGPT login'
                    ) : clanker.modelEndpoint ? (
                      summary.endpoint?.keyLabel ? (
                        <>
                          {summary.endpoint.keyLabel}{' '}
                          <span className="text-xs text-[var(--gray-9)]">from {summary.endpoint.name}</span>
                        </>
                      ) : summary.endpoint ? (
                        'None: the endpoint takes anonymous requests'
                      ) : (
                        "The endpoint's key"
                      )
                    ) : summary.key ? (
                      <>
                        {summary.key.label} <span className="font-mono text-xs text-[var(--gray-9)]">as {summary.key.envVar}</span>
                      </>
                    ) : (
                      'None'
                    )}
                  </dd>
                </dl>
              </div>

              {summary.usesChatGptLogin && (
                <ChatGptLoginCard
                  clanker={clanker}
                  login={secrets.find((secret) => secret.id === summary.loginSecretId) ?? null}
                  onConnected={() => void loadData()}
                />
              )}

              {summary.extras.length > 0 && (
                <div className="app-frame rounded-lg p-6">
                  <Subheading className="mb-4">Extra environment variables</Subheading>
                  <div className="space-y-3">
                    {summary.extras.map((binding) => {
                      const secret = secrets.find((candidate) => candidate.id === binding.secretId)
                      return (
                        <div key={binding.secretId} className="rounded bg-[var(--gray-3)] p-3">
                          <div className="font-mono font-medium text-[var(--gray-12)]">{binding.envVar}</div>
                          <div className="mt-1 text-sm text-[var(--gray-9)]">
                            {secret ? `${secret.name} · ${secret.secretLocation}` : 'Secret deleted'}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {deploymentDetails.length > 0 && (
                <details className="app-frame rounded-lg p-6">
                  <summary className="cursor-pointer">
                    <Subheading className="inline">Compute details</Subheading>
                  </summary>
                  <div className="mt-4 space-y-0">
                    {deploymentDetails.map((detail, index) => (
                      <div key={detail.label} className={`${index > 0 ? 'border-t border-[var(--gray-6)]' : ''} py-3`}>
                        <div className="text-xs font-medium tracking-wider text-[var(--gray-9)] uppercase">
                          {detail.label}
                        </div>
                        <div className="mt-1 font-mono text-sm break-all whitespace-pre-wrap text-[var(--gray-12)]">
                          {detail.value}
                        </div>
                      </div>
                    ))}
                  </div>
                  {dockerBuildLogs.length > 0 && (
                    <div className="mt-4 border-t border-[var(--gray-6)] pt-4">
                      <div className="text-xs font-medium tracking-wider text-[var(--gray-9)] uppercase">
                        Recent Docker Build Logs
                      </div>
                      <pre className="mt-2 max-h-72 overflow-auto rounded bg-[var(--gray-3)] p-3 font-mono text-xs break-all whitespace-pre-wrap text-[var(--gray-11)]">
                        {dockerBuildLogs.join('\n')}
                      </pre>
                    </div>
                  )}
                </details>
              )}

              <RunnerInstructionsAndTools clanker={clanker} />
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
