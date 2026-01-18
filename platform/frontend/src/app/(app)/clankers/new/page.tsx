'use client'

import { Button } from '@/components/button'
import { Description, Field, FieldGroup, Fieldset, Label } from '@/components/fieldset'
import { Heading, Subheading } from '@/components/heading'
import { Input } from '@/components/input'
import { Select } from '@/components/select'
import { Textarea } from '@/components/textarea'
import { createClanker, getDeploymentStrategies } from '@/service/api/clanker-api'
import type { ConfigFileInput, DeploymentStrategy } from '@viberator/types'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

// Default config file types that users commonly use
const DEFAULT_CONFIG_FILE_TYPES = [
  { type: 'claude.md', label: 'Claude.md', placeholder: '# Claude Configuration\n\nYou are a helpful assistant...' },
  { type: 'agents.md', label: 'Agents.md', placeholder: '# Agents\n\n## Primary Agent\n...' },
  { type: 'skills.md', label: 'Skills.md', placeholder: '# Skills\n\n## Code Review\n...' },
]

export default function NewClankerPage() {
  const router = useRouter()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [deploymentStrategies, setDeploymentStrategies] = useState<DeploymentStrategy[]>([])
  const [selectedStrategyId, setSelectedStrategyId] = useState<string>('')
  const [configFiles, setConfigFiles] = useState<Record<string, string>>({})
  const [customConfigFileName, setCustomConfigFileName] = useState('')

  useEffect(() => {
    async function loadStrategies() {
      try {
        const strategies = await getDeploymentStrategies()
        setDeploymentStrategies(strategies)
      } catch (err) {
        console.error('Failed to load deployment strategies:', err)
      }
    }
    loadStrategies()
  }, [])

  const selectedStrategy = deploymentStrategies.find((s) => s.id === selectedStrategyId)

  function handleConfigFileChange(fileType: string, content: string) {
    setConfigFiles((prev) => ({ ...prev, [fileType]: content }))
  }

  function addCustomConfigFile() {
    if (customConfigFileName.trim()) {
      setConfigFiles((prev) => ({ ...prev, [customConfigFileName.trim()]: '' }))
      setCustomConfigFileName('')
    }
  }

  function removeConfigFile(fileType: string) {
    setConfigFiles((prev) => {
      const next = { ...prev }
      delete next[fileType]
      return next
    })
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsSubmitting(true)
    setError(null)

    const formData = new FormData(event.currentTarget)

    // Build config files array
    const configFilesArray: ConfigFileInput[] = Object.entries(configFiles)
      .filter(([, content]) => content.trim() !== '')
      .map(([fileType, content]) => ({ fileType, content }))

    // Build deployment config from form
    let deploymentConfig: Record<string, unknown> | null = null
    if (selectedStrategy) {
      if (selectedStrategy.name === 'docker') {
        deploymentConfig = {
          containerImage: (formData.get('containerImage') as string) || '',
          ports: {},
          environmentVariables: {},
        }
      } else if (selectedStrategy.name === 'ecs') {
        deploymentConfig = {
          clusterArn: (formData.get('clusterArn') as string) || '',
          taskDefinitionArn: (formData.get('taskDefinitionArn') as string) || '',
          subnetIds: [],
          securityGroupIds: [],
        }
      }
    }

    try {
      const clanker = await createClanker({
        name: formData.get('name') as string,
        description: (formData.get('description') as string) || null,
        deploymentStrategyId: selectedStrategyId || null,
        deploymentConfig,
        configFiles: configFilesArray,
      })
      router.push(`/clankers/${clanker.slug}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create clanker')
      setIsSubmitting(false)
    }
  }

  return (
    <>
      <Heading>Create New Clanker</Heading>
      <Subheading className="mt-2">Configure a new agent worker for your viberator tasks.</Subheading>

      <form onSubmit={handleSubmit} className="mt-8 max-w-2xl">
        {error && (
          <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-600 dark:border-red-900 dark:bg-red-950 dark:text-red-400">
            {error}
          </div>
        )}

        <Fieldset>
          <FieldGroup>
            <Field>
              <Label>Name</Label>
              <Description>A unique name for your clanker.</Description>
              <Input name="name" required placeholder="My Awesome Clanker" />
            </Field>

            <Field>
              <Label>Description</Label>
              <Description>A brief description of what this clanker does.</Description>
              <Textarea name="description" rows={3} placeholder="This clanker handles..." />
            </Field>

            <Field>
              <Label>Deployment Strategy</Label>
              <Description>Choose how to deploy this clanker.</Description>
              <Select
                name="deploymentStrategyId"
                value={selectedStrategyId}
                onChange={(e) => setSelectedStrategyId(e.target.value)}
              >
                <option value="">Select a deployment strategy...</option>
                {deploymentStrategies.map((strategy) => (
                  <option key={strategy.id} value={strategy.id}>
                    {strategy.name.charAt(0).toUpperCase() + strategy.name.slice(1)}
                    {strategy.description ? ` - ${strategy.description}` : ''}
                  </option>
                ))}
              </Select>
            </Field>

            {selectedStrategy?.name === 'docker' && (
              <Field>
                <Label>Container Image</Label>
                <Description>The Docker image to use for this clanker.</Description>
                <Input name="containerImage" placeholder="ghcr.io/myorg/clanker:latest" />
              </Field>
            )}

            {selectedStrategy?.name === 'ecs' && (
              <>
                <Field>
                  <Label>Cluster ARN</Label>
                  <Description>The ARN of the ECS cluster.</Description>
                  <Input name="clusterArn" placeholder="arn:aws:ecs:us-east-1:123456789:cluster/my-cluster" />
                </Field>
                <Field>
                  <Label>Task Definition ARN</Label>
                  <Description>The ARN of the ECS task definition.</Description>
                  <Input
                    name="taskDefinitionArn"
                    placeholder="arn:aws:ecs:us-east-1:123456789:task-definition/my-task:1"
                  />
                </Field>
              </>
            )}
          </FieldGroup>
        </Fieldset>

        <Fieldset className="mt-10">
          <legend className="text-base/6 font-semibold text-zinc-950 dark:text-white">Configuration Files</legend>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Add markdown files that define how your clanker behaves. You can add custom file types as needed.
          </p>

          <FieldGroup className="mt-6">
            {DEFAULT_CONFIG_FILE_TYPES.map((fileConfig) => (
              <Field key={fileConfig.type}>
                <Label>{fileConfig.label}</Label>
                <Textarea
                  rows={6}
                  value={configFiles[fileConfig.type] || ''}
                  onChange={(e) => handleConfigFileChange(fileConfig.type, e.target.value)}
                  placeholder={fileConfig.placeholder}
                  className="font-mono"
                />
              </Field>
            ))}

            {/* Custom config files */}
            {Object.keys(configFiles)
              .filter((type) => !DEFAULT_CONFIG_FILE_TYPES.some((d) => d.type === type))
              .map((fileType) => (
                <Field key={fileType}>
                  <div className="flex items-center justify-between">
                    <Label>{fileType}</Label>
                    <button
                      type="button"
                      onClick={() => removeConfigFile(fileType)}
                      className="text-sm text-red-600 hover:text-red-700 dark:text-red-400"
                    >
                      Remove
                    </button>
                  </div>
                  <Textarea
                    rows={6}
                    value={configFiles[fileType] || ''}
                    onChange={(e) => handleConfigFileChange(fileType, e.target.value)}
                    placeholder={`Content for ${fileType}...`}
                    className="font-mono"
                  />
                </Field>
              ))}

            {/* Add custom config file */}
            <div className="flex items-end gap-2">
              <Field className="flex-1">
                <Label>Add Custom Config File</Label>
                <Input
                  value={customConfigFileName}
                  onChange={(e) => setCustomConfigFileName(e.target.value)}
                  placeholder="e.g., prompts.md, tools.yaml"
                />
              </Field>
              <Button type="button" outline onClick={addCustomConfigFile} disabled={!customConfigFileName.trim()}>
                Add File
              </Button>
            </div>
          </FieldGroup>
        </Fieldset>

        <div className="mt-10 flex gap-4">
          <Button type="submit" color="brand" disabled={isSubmitting}>
            {isSubmitting ? 'Creating...' : 'Create Clanker'}
          </Button>
          <Button type="button" plain onClick={() => router.back()}>
            Cancel
          </Button>
        </div>
      </form>
    </>
  )
}
