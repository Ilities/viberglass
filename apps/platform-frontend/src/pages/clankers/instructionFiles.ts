import { getAgentHarnessConfigFiles, type AgentType } from '@viberglass/types'

export const AGENTS_FILE_TYPE = 'AGENTS.md'

export interface HarnessConfigFile {
  fileType: string
  label: string
  /** How the file refers to an attached secret, shown next to the editor. */
  referenceHint: string
  placeholder: string
}

// Templates name OPENAI_API_KEY because only model-provider variables reach the agent.
const HARNESS_CONFIG_TEMPLATES: Record<string, Omit<HarnessConfigFile, 'fileType'>> = {
  'opencode.json': {
    label: 'OpenCode Configuration',
    referenceHint: 'Refer to an attached secret as {env:SECRET_NAME}.',
    placeholder: `{
  "$schema": "https://opencode.ai/config.json",
  "provider": {
    "my-proxy": {
      "npm": "@ai-sdk/openai-compatible",
      "options": {
        "baseURL": "https://llm-proxy.example.com/v1",
        "apiKey": "{env:OPENAI_API_KEY}"
      },
      "models": {
        "my-model": { "name": "My model" }
      }
    }
  }
}`,
  },
  'pi/models.json': {
    label: 'Pi Models (models.json)',
    referenceHint: 'Refer to an attached secret as $SECRET_NAME.',
    placeholder: `{
  "providers": {
    "my-proxy": {
      "baseUrl": "https://llm-proxy.example.com/v1",
      "api": "openai-completions",
      "apiKey": "$OPENAI_API_KEY",
      "models": [{ "id": "my-model" }]
    }
  }
}`,
  },
}

export function getHarnessConfigFile(agentType: AgentType | ''): HarnessConfigFile | undefined {
  if (!agentType) {
    return undefined
  }
  const fileType = getAgentHarnessConfigFiles(agentType).find((candidate) => candidate in HARNESS_CONFIG_TEMPLATES)
  return fileType ? { fileType, ...HARNESS_CONFIG_TEMPLATES[fileType] } : undefined
}
