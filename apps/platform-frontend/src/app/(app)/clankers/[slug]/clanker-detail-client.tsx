'use client'

import { Avatar } from '@/components/avatar'
import { Badge } from '@/components/badge'
import { Button } from '@/components/button'
import { DescriptionList, DescriptionTerm, DescriptionDetails } from '@/components/description-list'
import { Divider } from '@/components/divider'
import { Heading, Subheading } from '@/components/heading'
import { ClankerHealth } from './clanker-health'
import { getClankerBySlug, formatClankerStatus, formatDeploymentStrategy } from '@/data'
import { getSecret } from '@/service/api/secret-api'
import type { Secret } from '@/service/api/secret-api'
import type { Clanker } from '@viberglass/types'
import { Pencil1Icon } from '@radix-ui/react-icons'
import { notFound } from 'next/navigation'
import { ClankerActions } from './clanker-actions'
import { useEffect, useState } from 'react'

interface ClankerDetailClientProps {
  slug: string
}

export function ClankerDetailClient({ slug }: ClankerDetailClientProps) {
  const [clanker, setClanker] = useState<Clanker | null>(null)
  const [secrets, setSecrets] = useState<Secret[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    async function loadData() {
      const clankerData = await getClankerBySlug(slug)

      if (!clankerData) {
        notFound()
      }

      const secretResults = await Promise.all(
        (clankerData.secretIds || []).map(async (secretId) => {
          try {
            return await getSecret(secretId)
          } catch (error) {
            console.error(`Failed to fetch secret ${secretId}:`, error)
            return null
          }
        })
      ).then((results) => results.filter((s): s is Secret => s !== null))

      setClanker(clankerData)
      setSecrets(secretResults)
      setIsLoading(false)
    }
    loadData()
  }, [slug])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-zinc-500 dark:text-zinc-400">Loading...</div>
      </div>
    )
  }

  if (!clanker) {
    return null
  }

  const statusInfo = formatClankerStatus(clanker.status)
  const deploymentConfig = clanker.deploymentConfig as Record<string, unknown> | null

  return (
    <>
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <Avatar
            initials={clanker.name.substring(0, 2).toUpperCase()}
            className="bg-brand-gradient size-16 text-brand-charcoal text-xl"
          />
          <div>
            <Heading>{clanker.name}</Heading>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              {clanker.description || 'No description'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ClankerActions clanker={clanker} />
          <Button href={`/clankers/${clanker.slug}/edit`} outline>
            <Pencil1Icon />
            Edit
          </Button>
        </div>
      </div>

      <Divider className="my-8" />

      <div className="grid gap-8 lg:grid-cols-2">
        <div>
          <Subheading>Details</Subheading>
          <DescriptionList className="mt-4">
            <DescriptionTerm>Status</DescriptionTerm>
            <DescriptionDetails>
              <Badge className={statusInfo.color}>{statusInfo.label}</Badge>
              {clanker.statusMessage && (
                <span className="ml-2 text-sm text-zinc-500">{clanker.statusMessage}</span>
              )}
              {clanker.status === 'inactive' && (
                <div className="mt-2 text-sm text-zinc-500">
                  This clanker has not been started yet. Use Start to provision it.
                </div>
              )}
              {clanker.status === 'deploying' && (
                <div className="mt-2 text-sm text-zinc-500">Provisioning is in progress. This may take a moment.</div>
              )}
              {clanker.status === 'failed' && (
                <div className="mt-2 text-sm text-zinc-500">
                  Start the clanker again after updating its configuration.
                </div>
              )}
            </DescriptionDetails>

            <ClankerHealth clankerId={clanker.id} />

            <DescriptionTerm>Deployment Strategy</DescriptionTerm>
            <DescriptionDetails>
              {formatDeploymentStrategy(clanker.deploymentStrategy)}
              {clanker.deploymentStrategy?.description && (
                <span className="ml-2 text-sm text-zinc-500">
                  ({clanker.deploymentStrategy.description})
                </span>
              )}
            </DescriptionDetails>

            <DescriptionTerm>Agent</DescriptionTerm>
            <DescriptionDetails>
              {clanker.agent ? (
                <span className="font-medium">
                  {clanker.agent === 'claude-code' && 'Claude Code'}
                  {clanker.agent === 'qwen-cli' && 'Qwen CLI'}
                  {clanker.agent === 'qwen-api' && 'Qwen API'}
                  {clanker.agent === 'codex' && 'OpenAI Codex'}
                  {clanker.agent === 'gemini-cli' && 'Gemini CLI'}
                  {clanker.agent === 'mistral-vibe' && 'Mistral Vibe'}
                </span>
              ) : (
                <span className="text-zinc-500">Claude Code (default)</span>
              )}
            </DescriptionDetails>

            <DescriptionTerm>Secrets</DescriptionTerm>
            <DescriptionDetails>
              {secrets.length > 0 ? (
                <div className="space-y-1">
                  {secrets.map((secret) => (
                    <div key={secret.id} className="text-sm">
                      <span className="font-medium">{secret.name}</span>
                      <span className="ml-2 text-zinc-500">
                        ({secret.secretLocation}
                        {secret.secretPath && ` - ${secret.secretPath}`})
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <span className="text-zinc-500">No secrets configured</span>
              )}
            </DescriptionDetails>

            <DescriptionTerm>Created</DescriptionTerm>
            <DescriptionDetails>{new Date(clanker.createdAt).toLocaleString()}</DescriptionDetails>

            <DescriptionTerm>Updated</DescriptionTerm>
            <DescriptionDetails>{new Date(clanker.updatedAt).toLocaleString()}</DescriptionDetails>

            {/* Docker-specific config */}
            {clanker.deploymentStrategy?.name === 'docker' && deploymentConfig && (
              <>
                <DescriptionTerm>Container Image</DescriptionTerm>
                <DescriptionDetails className="font-mono text-sm">
                  {(deploymentConfig.containerImage as string) || 'Not configured'}
                </DescriptionDetails>
              </>
            )}

            {/* ECS-specific config */}
            {clanker.deploymentStrategy?.name === 'ecs' && deploymentConfig && (
              <>
                <DescriptionTerm>Cluster ARN</DescriptionTerm>
                <DescriptionDetails className="font-mono text-sm break-all">
                  {(deploymentConfig.clusterArn as string) || 'Not configured'}
                </DescriptionDetails>

                <DescriptionTerm>Task Definition ARN</DescriptionTerm>
                <DescriptionDetails className="font-mono text-sm break-all">
                  {(deploymentConfig.taskDefinitionArn as string) || 'Not configured'}
                </DescriptionDetails>
              </>
            )}
          </DescriptionList>
        </div>

        <div className="space-y-8">
          <Subheading>Configuration Files</Subheading>

          {clanker.configFiles.length > 0 ? (
            clanker.configFiles.map((file) => (
              <div key={file.id}>
                <h4 className="text-sm font-medium text-zinc-950 dark:text-white">{file.fileType}</h4>
                <div className="mt-2 rounded-lg border border-zinc-950/10 bg-zinc-50 p-4 dark:border-white/10 dark:bg-zinc-900">
                  <pre className="whitespace-pre-wrap font-mono text-sm text-zinc-700 dark:text-zinc-300">
                    {file.content}
                  </pre>
                </div>
              </div>
            ))
          ) : (
            <div className="rounded-lg border border-dashed border-zinc-300 bg-zinc-50 p-8 text-center dark:border-zinc-700 dark:bg-zinc-900">
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                No configuration files set up yet.
              </p>
              <Button href={`/clankers/${clanker.slug}/edit`} className="mt-4" outline>
                <Pencil1Icon />
                Add Configuration
              </Button>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
