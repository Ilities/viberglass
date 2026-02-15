import { Avatar } from '@/components/avatar'
import { Badge } from '@/components/badge'
import { Button } from '@/components/button'
import { ClankerHealthBadge } from '@/components/clanker-health-badge'
import { Heading, Subheading } from '@/components/heading'
import { InfoItem } from '@/components/info-item'
import { Section } from '@/components/section'
import { formatClankerStatus, formatDeploymentStrategy, getClankerBySlug } from '@/data'
import { getSecret } from '@/service/api/secret-api'
import type { Secret } from '@/service/api/secret-api'
import { getClankerHealth } from '@/service/api/clanker-api'
import type { Clanker, ClankerHealthStatus } from '@viberglass/types'
import {
  ArrowLeftIcon,
  CalendarIcon,
  ClockIcon,
  CubeIcon,
  ExternalLinkIcon,
  Pencil1Icon,
  ReloadIcon,
  StackIcon,
} from '@radix-ui/react-icons'
import { useEffect, useState } from 'react'
import { ClankerActions } from './clanker-actions'
import { useParams } from 'react-router-dom'

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
  switch (agent) {
    case 'claude-code':
      return 'Claude Code'
    case 'qwen-cli':
      return 'Qwen CLI'
    case 'qwen-api':
      return 'Qwen API'
    case 'codex':
      return 'OpenAI Codex'
    case 'opencode':
      return 'OpenCode'
    case 'kimi-code':
      return 'Kimi Code'
    case 'gemini-cli':
      return 'Gemini CLI'
    case 'mistral-vibe':
      return 'Mistral Vibe'
    default:
      return 'Claude Code'
  }
}

function getStatusHint(status: Clanker['status']): string | null {
  switch (status) {
    case 'inactive':
      return 'This clanker has not been started yet. Use Start to provision it.'
    case 'deploying':
      return 'Provisioning is in progress. This may take a moment.'
    case 'failed':
      return 'Start the clanker again after updating its configuration.'
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

export function ClankerDetailPage() {
  const { slug } = useParams<{ slug: string }>()
  const [clanker, setClanker] = useState<Clanker | null>(null)
  const [secrets, setSecrets] = useState<Secret[]>([])
  const [health, setHealth] = useState<ClankerHealthStatus | null>(null)
  const [healthError, setHealthError] = useState<string | null>(null)
  const [isRefreshingHealth, setIsRefreshingHealth] = useState(false)
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

        const [secretResults, healthResult] = await Promise.all([
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
          getClankerHealth(clankerData.id).catch((error) => {
            const message = error instanceof Error ? error.message : 'Failed to fetch health'
            setHealthError(message)
            return null
          }),
        ])

        setClanker(clankerData)
        setSecrets(secretResults)
        setHealth(healthResult)
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
  }, [slug, clanker?.id, clanker?.status])

  const refreshHealth = async () => {
    if (!clanker) return
    setIsRefreshingHealth(true)
    setHealthError(null)
    try {
      const updatedHealth = await getClankerHealth(clanker.id)
      setHealth(updatedHealth)
    } catch (error) {
      setHealthError(error instanceof Error ? error.message : 'Failed to refresh health')
    } finally {
      setIsRefreshingHealth(false)
    }
  }

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
  const deploymentConfig = clanker.deploymentConfig as Record<string, unknown> | null
  const deploymentDetails: Array<{ label: string; value: string }> = []
  let dockerBuildLogs: string[] = []
  const strategyName = clanker.deploymentStrategy?.name?.toLowerCase()

  if (strategyName === 'docker' && deploymentConfig) {
    const imageMetadata =
      (deploymentConfig.imageMetadata as Record<string, unknown> | undefined) || {}
    const dockerBuild = (deploymentConfig.dockerBuild as Record<string, unknown> | undefined) || {}
    const rawLogs = dockerBuild.logs

    deploymentDetails.push({
      label: 'Container Image',
      value: formatConfigValue(deploymentConfig.containerImage),
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

  if (strategyName === 'ecs' && deploymentConfig) {
    const taskDefinitionDetails =
      (deploymentConfig.taskDefinitionDetails as Record<string, unknown> | undefined) || {}
    const containerImages =
      (taskDefinitionDetails.containerImages as Array<Record<string, unknown>> | undefined) || []

    deploymentDetails.push({
      label: 'Cluster ARN',
      value: formatConfigValue(deploymentConfig.clusterArn),
    })
    deploymentDetails.push({
      label: 'Task Definition ARN',
      value: formatConfigValue(deploymentConfig.taskDefinitionArn),
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

  if ((strategyName === 'aws-lambda-container' || strategyName === 'lambda') && deploymentConfig) {
    const functionDetails =
      (deploymentConfig.functionDetails as Record<string, unknown> | undefined) || {}

    deploymentDetails.push({
      label: 'Function Name',
      value: formatConfigValue(deploymentConfig.functionName),
    })
    deploymentDetails.push({
      label: 'Function ARN',
      value: formatConfigValue(deploymentConfig.functionArn),
    })
    deploymentDetails.push({
      label: 'Image URI',
      value: formatConfigValue(functionDetails.imageUri ?? deploymentConfig.imageUri),
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
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-4 mb-6">
        <Button href="/clankers" plain>
          <ArrowLeftIcon className="h-4 w-4" />
          Back to Clankers
        </Button>
      </div>

      <div className="mb-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <Avatar
              square
              initials={clanker.name.substring(0, 2).toUpperCase()}
              className="size-14 bg-brand-gradient text-brand-charcoal text-lg shadow-sm"
            />

            <div>
              <Heading className="text-2xl">{clanker.name}</Heading>
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <Badge color={getStatusBadgeColor(clanker.status)}>{statusInfo.label}</Badge>
                <Badge color="blue">{formatDeploymentStrategy(clanker.deploymentStrategy)}</Badge>
                <Badge color="violet">{formatAgent(clanker.agent)}</Badge>
              </div>
              <p className="mt-2 text-sm text-[var(--gray-9)]">
                {clanker.description || 'No description'}
              </p>
              {clanker.statusMessage && (
                <p className="mt-1 text-sm text-[var(--gray-9)]">{clanker.statusMessage}</p>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            <ClankerActions clanker={clanker} />
            <Button href={`/clankers/${clanker.slug}/edit`} outline>
              <Pencil1Icon className="h-4 w-4" />
              Edit
            </Button>
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0">
        <div className="grid gap-6 lg:grid-cols-12 h-full">
          <div className="lg:col-span-4 xl:col-span-3 space-y-1">
            <div className="app-frame rounded-lg p-4">
              <Section title="Clanker Information">
                <InfoItem
                  icon={<StackIcon className="h-4 w-4" />}
                  label="Slug"
                  value={<span className="font-mono text-xs">{clanker.slug}</span>}
                />
                <div className="h-px bg-[var(--gray-6)] mx-1" />
                <InfoItem
                  icon={<CubeIcon className="h-4 w-4" />}
                  label="Status"
                  value={<Badge color={getStatusBadgeColor(clanker.status)}>{statusInfo.label}</Badge>}
                />
                <div className="h-px bg-[var(--gray-6)] mx-1" />
                <InfoItem
                  icon={<ExternalLinkIcon className="h-4 w-4" />}
                  label="Deployment"
                  value={formatDeploymentStrategy(clanker.deploymentStrategy)}
                />
                <div className="h-px bg-[var(--gray-6)] mx-1" />
                <InfoItem
                  icon={<CubeIcon className="h-4 w-4" />}
                  label="Agent"
                  value={formatAgent(clanker.agent)}
                />
              </Section>
            </div>

            <div className="app-frame rounded-lg p-4">
              <Section title="Timeline">
                <InfoItem
                  icon={<CalendarIcon className="h-4 w-4" />}
                  label="Created"
                  value={new Date(clanker.createdAt).toLocaleString()}
                />
                <div className="h-px bg-[var(--gray-6)] mx-1" />
                <InfoItem
                  icon={<ClockIcon className="h-4 w-4" />}
                  label="Updated"
                  value={new Date(clanker.updatedAt).toLocaleString()}
                />
              </Section>
            </div>

            <div className="app-frame rounded-lg p-4">
              <Section title="Health">
                <div className="px-1 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-xs font-medium uppercase tracking-wider text-[var(--gray-9)]">Status</div>
                    <div className="flex items-center gap-2">
                      {health ? (
                        <ClankerHealthBadge health={health} />
                      ) : healthError ? (
                        <Badge color="red">Error</Badge>
                      ) : (
                        <Badge color="zinc">Checking...</Badge>
                      )}
                      <Button plain onClick={() => void refreshHealth()} disabled={isRefreshingHealth}>
                        <ReloadIcon className={`h-4 w-4 ${isRefreshingHealth ? 'animate-spin' : ''}`} />
                      </Button>
                    </div>
                  </div>
                  {health?.message && <p className="mt-2 text-sm text-[var(--gray-9)]">{health.message}</p>}
                  {healthError && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{healthError}</p>}
                </div>
                {health && (
                  <>
                    <div className="h-px bg-[var(--gray-6)] mx-1" />
                    <div className="px-1 py-3 space-y-1 text-sm text-[var(--gray-11)]">
                      <div>{health.checks.resourceExists ? '✓' : '✗'} Resource exists</div>
                      <div>{health.checks.deploymentConfigured ? '✓' : '✗'} Deployment configured</div>
                      <div>{health.checks.invokerAvailable ? '✓' : '✗'} Invoker available</div>
                      <div className="text-xs text-[var(--gray-9)] pt-1">
                        Last checked: {new Date(health.lastChecked).toLocaleString()}
                      </div>
                    </div>
                  </>
                )}
              </Section>
            </div>
          </div>

          <div className="lg:col-span-8 xl:col-span-9 space-y-6">
            <div className="app-frame rounded-lg p-6">
              <Subheading className="mb-4">Description</Subheading>
              <div className="text-[var(--gray-11)]">
                {clanker.description || 'No description provided.'}
              </div>
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
                      <div className="text-xs font-medium uppercase tracking-wider text-[var(--gray-9)]">
                        {detail.label}
                      </div>
                      <div className="mt-1 whitespace-pre-wrap break-all font-mono text-sm text-[var(--gray-12)]">
                        {detail.value}
                      </div>
                    </div>
                  ))}
                </div>
                {dockerBuildLogs.length > 0 && (
                  <div className="mt-4 border-t border-[var(--gray-6)] pt-4">
                    <div className="text-xs font-medium uppercase tracking-wider text-[var(--gray-9)]">
                      Recent Docker Build Logs
                    </div>
                    <pre className="mt-2 max-h-72 overflow-auto rounded bg-[var(--gray-3)] p-3 whitespace-pre-wrap break-all font-mono text-xs text-[var(--gray-11)]">
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
                      <div className="text-xs font-medium uppercase tracking-wider text-[var(--gray-9)] mb-2">
                        {file.fileType}
                      </div>
                      <div className="rounded bg-[var(--gray-3)] p-4">
                        <pre className="whitespace-pre-wrap break-all font-mono text-sm text-[var(--gray-11)]">
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
  )
}
