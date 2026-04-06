import { Avatar } from '@/components/avatar'
import { Badge } from '@/components/badge'
import { Breadcrumbs } from '@/components/breadcrumbs'
import { Button } from '@/components/button'
import { Heading, Subheading } from '@/components/heading'
import { InfoItem } from '@/components/info-item'
import { PageMeta } from '@/components/page-meta'
import { Section } from '@/components/section'
import { formatClankerStatus, formatDeploymentStrategy, getClankerBySlug } from '@/data'
import type { Secret } from '@/service/api/secret-api'
import { getSecret } from '@/service/api/secret-api'
import {
  CalendarIcon,
  ClockIcon,
  CubeIcon,
  ExternalLinkIcon,
  Pencil1Icon,
  StackIcon,
} from '@radix-ui/react-icons'
import { getAgentLabel, isObjectRecord, type Clanker } from '@viberglass/types'
import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { ClankerActions } from './clanker-actions'
import { DEFAULT_CODEX_AUTH_SECRET_NAME } from './config/types'

function getStatusBadgeColor(status: Clanker['status']): 'green' | 'blue' | 'red' | 'zinc' {
  switch (status) {
    case 'active':
      return 'green'
    case 'deploying':
      return 'blue'
    case 'failed':
      return 'red'
    case 'inactive':
    default:
      return 'zinc'
  }
}

function formatAgent(agent?: Clanker['agent'] | null): string {
  return getAgentLabel(agent)
}

function getStatusHint(status: Clanker['status']): string | null {
  switch (status) {
    case 'inactive':
      return 'This agent has not been started yet. Click Start to provision it.'
    case 'deploying':
      return 'Provisioning is in progress. This may take a moment.'
    case 'failed':
      return 'Deployment failed. Start the agent again after updating its configuration.'
    default:
      return null
  }
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
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    async function loadData() {
      if (!slug) {
        setIsLoading(false)
        return
      }

      try {
        const clankerData = await getClankerBySlug(slug)
        if (!clankerData) return

        const [secretResults] = await Promise.all([
          Promise.all(
            (clankerData.secretIds || []).map(async (secretId) => {
              try {
                return await getSecret(secretId)
              } catch (error) {
                console.error(`Failed to fetch secret ${secretId}:`, error)
                return null
              }
            })
          ).then((results) => results.filter((secret): secret is Secret => secret !== null)),
        ])

        setClanker(clankerData)
        setSecrets(secretResults)
      } finally {
        setIsLoading(false)
      }
    }

    void loadData()
  }, [slug])

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
          console.error('Failed to poll clanker status:', error)
        })
    }, 3000)

    return () => window.clearInterval(intervalId)
  }, [slug, clanker])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-[var(--gray-9)]">Loading clanker details...</div>
      </div>
    )
  }

  if (!clanker) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-red-600 dark:text-red-400">Clanker not found</div>
      </div>
    )
  }

  const statusInfo = formatClankerStatus(clanker.status)
  const statusHint = getStatusHint(clanker.status)
  const deploymentConfig = isObjectRecord(clanker.deploymentConfig) ? clanker.deploymentConfig : null
  const v1Strategy = isObjectRecord(deploymentConfig?.strategy) ? deploymentConfig.strategy : null
  const v1Agent = isObjectRecord(deploymentConfig?.agent) ? deploymentConfig.agent : null
  const strategyConfig = deploymentConfig?.version === 1 && v1Strategy ? v1Strategy : deploymentConfig
  const agentConfig = deploymentConfig?.version === 1 && v1Agent ? v1Agent : null
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

  if (clanker.agent === 'codex') {
    const codexAuth =
      (isObjectRecord(agentConfig?.codexAuth) ? agentConfig.codexAuth : null) ||
      (isObjectRecord(deploymentConfig?.codexAuth) ? deploymentConfig.codexAuth : null) ||
      {}
    const mode =
      codexAuth.mode === 'chatgpt_device_stored'
        ? 'chatgpt_device_stored'
        : codexAuth.mode === 'chatgpt_device'
          ? 'chatgpt_device'
          : 'api_key'

    deploymentDetails.push({
      label: 'Codex Auth Mode',
      value:
        mode === 'chatgpt_device'
          ? 'ChatGPT device auth (ephemeral token)'
          : mode === 'chatgpt_device_stored'
            ? 'ChatGPT device auth (persisted token)'
            : 'API key',
    })
    deploymentDetails.push({
      label: 'Codex Auth Secret (fixed)',
      value: DEFAULT_CODEX_AUTH_SECRET_NAME,
    })
  }

  return (
    <>
      <PageMeta title={clanker ? `${clanker.name} | Clanker` : 'Clanker'} />
      <div className="flex h-full flex-col">
        <Breadcrumbs
          items={[
            { label: 'Clankers', href: '/clankers' },
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
                  <Badge color={getStatusBadgeColor(clanker.status)}>{statusInfo.label}</Badge>
                  <Badge color="blue">{formatDeploymentStrategy(clanker.deploymentStrategy)}</Badge>
                  <Badge color="violet">{formatAgent(clanker.agent)}</Badge>
                </div>
                <p className="mt-2 text-sm text-[var(--gray-9)]">{clanker.description || 'No description'}</p>
                {clanker.statusMessage && <p className="mt-1 text-sm text-[var(--gray-9)]">{clanker.statusMessage}</p>}
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2">
              <ClankerActions clanker={clanker} onClankerUpdated={setClanker} />
              <Button href={`/clankers/${clanker.slug}/edit`} outline>
                <Pencil1Icon className="h-4 w-4" />
                Edit
              </Button>
            </div>
          </div>
        </div>

        <div className="min-h-0 flex-1">
          <div className="grid h-full gap-6 lg:grid-cols-12">
            <div className="space-y-1 lg:col-span-4 xl:col-span-3">
              <div className="app-frame rounded-lg p-4">
                <Section title="Clanker Information">
                  <InfoItem
                    icon={<StackIcon className="h-4 w-4" />}
                    label="Slug"
                    value={<span className="font-mono text-xs">{clanker.slug}</span>}
                  />
                  <div className="mx-1 h-px bg-[var(--gray-6)]" />
                  <InfoItem
                    icon={<CubeIcon className="h-4 w-4" />}
                    label="Status"
                    value={<Badge color={getStatusBadgeColor(clanker.status)}>{statusInfo.label}</Badge>}
                  />
                  <div className="mx-1 h-px bg-[var(--gray-6)]" />
                  <InfoItem
                    icon={<ExternalLinkIcon className="h-4 w-4" />}
                    label="Deployment"
                    value={formatDeploymentStrategy(clanker.deploymentStrategy)}
                  />
                  <div className="mx-1 h-px bg-[var(--gray-6)]" />
                  <InfoItem icon={<CubeIcon className="h-4 w-4" />} label="Agent" value={formatAgent(clanker.agent)} />
                </Section>
              </div>

              <div className="app-frame rounded-lg p-4">
                <Section title="Timeline">
                  <InfoItem
                    icon={<CalendarIcon className="h-4 w-4" />}
                    label="Created"
                    value={new Date(clanker.createdAt).toLocaleString()}
                  />
                  <div className="mx-1 h-px bg-[var(--gray-6)]" />
                  <InfoItem
                    icon={<ClockIcon className="h-4 w-4" />}
                    label="Updated"
                    value={new Date(clanker.updatedAt).toLocaleString()}
                  />
                </Section>
              </div>
            </div>

            <div className="space-y-6 lg:col-span-8 xl:col-span-9">
              <div className="app-frame rounded-lg p-6">
                <Subheading className="mb-4">Description</Subheading>
                <div className="text-[var(--gray-11)]">{clanker.description || 'No description provided.'}</div>
                {statusHint && <div className="mt-3 text-sm text-[var(--gray-9)]">{statusHint}</div>}
              </div>

              <div className="app-frame rounded-lg p-6">
                <Subheading className="mb-4">Secrets</Subheading>
                {secrets.length > 0 ? (
                  <div className="space-y-3">
                    {secrets.map((secret) => (
                      <div key={secret.id} className="rounded bg-[var(--gray-3)] p-3">
                        <div className="font-medium text-[var(--gray-12)]">{secret.name}</div>
                        <div className="mt-1 text-sm text-[var(--gray-9)]">
                          {secret.secretLocation}
                          {secret.secretPath && ` - ${secret.secretPath}`}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-[var(--gray-9)]">No secrets configured.</div>
                )}
              </div>

              {deploymentDetails.length > 0 && (
                <div className="app-frame rounded-lg p-6">
                  <Subheading className="mb-4">Deployment Configuration</Subheading>
                  <div className="space-y-0">
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
                </div>
              )}

              <div className="app-frame rounded-lg p-6">
                <Subheading className="mb-4">Configuration Files</Subheading>
                {clanker.configFiles.length > 0 ? (
                  <div className="space-y-4">
                    {clanker.configFiles.map((file) => (
                      <div key={file.id}>
                        <div className="mb-2 text-xs font-medium tracking-wider text-[var(--gray-9)] uppercase">
                          {file.fileType}
                        </div>
                        <div className="rounded bg-[var(--gray-3)] p-4">
                          <pre className="font-mono text-sm break-all whitespace-pre-wrap text-[var(--gray-11)]">
                            {file.content}
                          </pre>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded border border-dashed border-[var(--gray-6)] bg-[var(--gray-2)] p-6 text-center">
                    <p className="text-sm text-[var(--gray-9)]">No configuration files set up yet.</p>
                    <Button href={`/clankers/${clanker.slug}/edit`} className="mt-4" outline>
                      <Pencil1Icon className="h-4 w-4" />
                      Add Configuration
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
