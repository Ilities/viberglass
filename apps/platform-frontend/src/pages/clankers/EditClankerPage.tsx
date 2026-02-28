import { Heading, Subheading } from '@/components/heading'
import { PageMeta } from '@/components/page-meta'
import { getClankerBySlug } from '@/data'
import { getDeploymentStrategies, updateClanker } from '@/service/api/clanker-api'
import { getSecrets } from '@/service/api/secret-api'
import type { Clanker } from '@viberglass/types'
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ClankerForm } from './components/ClankerForm'
import { buildClankerDeploymentConfig } from './config/buildConfig'
import { splitClankerConfigFiles } from './config/nativeAgentConfig'
import { readClankerDeploymentConfig } from './config/readConfig'
import type { SkillEntry } from './config/types'
import { useClankerForm } from './config/useClankerForm'
import { AGENTS_FILE_TYPE, isSkillPath } from './instructionFiles'

function createSkillEntry(path: string = 'skills/new-skill.md', content = ''): SkillEntry {
  return {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    path,
    content,
  }
}

export function EditClankerPage() {
  const { slug } = useParams<{ slug: string }>()
  const navigate = useNavigate()
  const [clanker, setClanker] = useState<Clanker | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const form = useClankerForm()

  useEffect(() => {
    async function loadData() {
      if (!slug) return

      const [clankerData, strategies, secretsData] = await Promise.all([
        getClankerBySlug(slug),
        getDeploymentStrategies(),
        getSecrets(100, 0),
      ])

      if (!clankerData) {
        return
      }

      setClanker(clankerData)
      form.setDeploymentStrategies(strategies)
      form.setSecrets(secretsData)
      form.setSelectedStrategyId(clankerData.deploymentStrategyId || '')
      form.setSelectedAgent(clankerData.agent || '')
      form.setSelectedSecretIds(clankerData.secretIds || [])

      const parsedConfig = readClankerDeploymentConfig({
        deploymentConfig: clankerData.deploymentConfig,
        agent: clankerData.agent,
      })
      form.setProvisioningMode(parsedConfig.form.provisioningMode)
      form.setCodexAuthMode(parsedConfig.form.codexAuthMode)
      form.setQwenEndpoint(parsedConfig.form.qwenEndpoint)
      form.setOpencodeEndpoint(parsedConfig.form.opencodeEndpoint)
      form.setOpencodeModel(parsedConfig.form.opencodeModel)
      form.setGeminiModel(parsedConfig.form.geminiModel)
      const split = splitClankerConfigFiles(clankerData.agent, clankerData.configFiles)
      if (split.nativeConfigFile) {
        form.setNativeConfigEnabled(true)
        form.setNativeConfigPath(split.nativeConfigFile.fileType)
        form.setNativeConfigContent(split.nativeConfigFile.content)
      } else if (clankerData.agent) {
        await form.loadNativeConfigTemplate(clankerData.agent, clankerData.id).catch(() => undefined)
        form.setNativeConfigEnabled(false)
      }

      const loadedSkills: SkillEntry[] = []
      for (const file of split.instructionFiles) {
        if (file.fileType === AGENTS_FILE_TYPE) {
          form.setAgentInstructions(file.content)
          continue
        }

        if (isSkillPath(file.fileType)) {
          loadedSkills.push(createSkillEntry(file.fileType, file.content))
        }
      }

      form.setSkills(loadedSkills)
      setIsLoading(false)
    }

    loadData()
  }, [form, slug])

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!clanker) return

    form.setIsSubmitting(true)
    form.setError(null)

    const formData = new FormData(event.currentTarget)
    const configFilesResult = form.buildConfigFiles()
    if (configFilesResult.error) {
      form.setError(configFilesResult.error)
      form.setIsSubmitting(false)
      return
    }

    const newDeploymentConfig = buildClankerDeploymentConfig({
      strategyName: form.selectedStrategy?.name,
      selectedAgent: form.selectedAgent,
      form: {
        provisioningMode: form.provisioningMode,
        containerImage: ((formData.get('containerImage') as string) || '').trim(),
        clusterArn: ((formData.get('clusterArn') as string) || '').trim(),
        taskDefinitionArn: ((formData.get('taskDefinitionArn') as string) || '').trim(),
        functionArn: ((formData.get('functionArn') as string) || '').trim(),
        lambdaMemorySize: ((formData.get('lambdaMemorySize') as string) || '').trim(),
        lambdaTimeout: ((formData.get('lambdaTimeout') as string) || '').trim(),
        lambdaEphemeralStorage: ((formData.get('lambdaEphemeralStorage') as string) || '').trim(),
        codexAuthMode: form.codexAuthMode,
        qwenEndpoint: form.qwenEndpoint,
        opencodeEndpoint: form.opencodeEndpoint,
        opencodeModel: form.opencodeModel,
        geminiModel: form.geminiModel,
      },
    })

    try {
      const updated = await updateClanker(clanker.id, {
        name: formData.get('name') as string,
        description: (formData.get('description') as string) || null,
        deploymentStrategyId: form.selectedStrategyId || null,
        deploymentConfig: newDeploymentConfig,
        configFiles: configFilesResult.files,
        agent: form.selectedAgent || null,
        secretIds: form.selectedSecretIds,
      })
      navigate(`/clankers/${updated.slug}`)
    } catch (err) {
      form.setError(err instanceof Error ? err.message : 'Failed to update clanker')
      form.setIsSubmitting(false)
    }
  }

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

  const parsedDeploymentForm = readClankerDeploymentConfig({
    deploymentConfig: clanker.deploymentConfig,
    agent: clanker.agent,
  }).form

  return (
    <>
      <PageMeta title={clanker ? `Edit ${clanker.name}` : 'Edit Clanker'} />
      <Heading>Edit Clanker</Heading>
      <Subheading className="mt-2">Update the configuration for {clanker.name}.</Subheading>

      <ClankerForm
        error={form.error}
        isSubmitting={form.isSubmitting}
        submitButtonText="Save Changes"
        submittingButtonText="Saving..."
        nameDefaultValue={clanker.name}
        descriptionDefaultValue={clanker.description || ''}
        selectedAgent={form.selectedAgent}
        onAgentChange={form.setSelectedAgent}
        codexAuthMode={form.codexAuthMode}
        onCodexAuthModeChange={form.setCodexAuthMode}
        qwenEndpoint={form.qwenEndpoint}
        onQwenEndpointChange={form.setQwenEndpoint}
        opencodeEndpoint={form.opencodeEndpoint}
        onOpenCodeEndpointChange={form.setOpencodeEndpoint}
        opencodeModel={form.opencodeModel}
        onOpenCodeModelChange={form.setOpencodeModel}
        geminiModel={form.geminiModel}
        onGeminiModelChange={form.setGeminiModel}
        nativeConfigEnabled={form.nativeConfigEnabled}
        nativeConfigPath={form.nativeConfigPath}
        nativeConfigContent={form.nativeConfigContent}
        nativeConfigFormat={form.nativeConfigFormat}
        onNativeConfigEnabledChange={form.setNativeConfigEnabled}
        onNativeConfigPathChange={form.setNativeConfigPath}
        onNativeConfigContentChange={form.setNativeConfigContent}
        onNativeConfigUploadClick={() => form.nativeConfigFileInputRef.current?.click()}
        onNativeConfigUpload={form.handleNativeConfigUpload}
        nativeConfigFileInputRef={form.nativeConfigFileInputRef}
        onLoadNativeConfigTemplate={() => form.loadNativeConfigTemplate(form.selectedAgent, clanker.id)}
        secrets={form.secrets}
        selectedSecretIds={form.selectedSecretIds}
        onSecretIdsChange={form.setSelectedSecretIds}
        showAllSecrets={form.showAllSecrets}
        onShowAllSecretsChange={form.setShowAllSecrets}
        selectableSecrets={form.selectableSecrets}
        secretPickerDescription={form.secretPickerDescription}
        secretPickerEmptyMessage={form.secretPickerEmptyMessage}
        deploymentStrategies={form.deploymentStrategies}
        selectedStrategyId={form.selectedStrategyId}
        onStrategyChange={form.setSelectedStrategyId}
        provisioningMode={form.provisioningMode}
        onProvisioningModeChange={form.setProvisioningMode}
        strategyDefaults={parsedDeploymentForm}
        agentInstructions={form.agentInstructions}
        onAgentInstructionsChange={form.setAgentInstructions}
        skills={form.skills}
        onSkillUpdate={form.updateSkill}
        onSkillRemove={form.removeSkill}
        onAddSkill={form.addSkill}
        onAgentsUploadClick={() => form.agentsFileInputRef.current?.click()}
        onSkillsUploadClick={() => form.skillsFileInputRef.current?.click()}
        agentsFileInputRef={form.agentsFileInputRef}
        skillsFileInputRef={form.skillsFileInputRef}
        onAgentsUpload={form.handleAgentsUpload}
        onSkillsUpload={form.handleSkillsUpload}
        onSubmit={handleSubmit}
        onCancel={() => navigate(-1)}
      />
    </>
  )
}
