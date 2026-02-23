export type SecretNamePresetGroup = {
  id: string
  label: string
  helper: string
  names: string[]
}

export const SECRET_NAME_PRESET_GROUPS: SecretNamePresetGroup[] = [
  {
    id: 'claude-code',
    label: 'Claude Code',
    helper: 'Recommended: ANTHROPIC_API_KEY. Falls back to CLAUDE_CODE_API_KEY.',
    names: ['ANTHROPIC_API_KEY', 'CLAUDE_CODE_API_KEY', 'ANTHROPIC_BASE_URL', 'ANTHROPIC_MODEL'],
  },
  {
    id: 'codex',
    label: 'OpenAI Codex',
    helper: 'Recommended: OPENAI_API_KEY. Falls back to CODEX_API_KEY.',
    names: ['OPENAI_API_KEY', 'CODEX_API_KEY', 'OPENAI_BASE_URL', 'OPENAI_ORG_ID'],
  },
  {
    id: 'opencode',
    label: 'OpenCode',
    helper: 'Recommended: OPENCODE_API_KEY or OPENAI_API_KEY.',
    names: ['OPENCODE_API_KEY', 'OPENAI_API_KEY', 'OPENCODE_BASE_URL', 'OPENAI_BASE_URL'],
  },
  {
    id: 'qwen-cli',
    label: 'Qwen CLI',
    helper: 'Recommended: QWEN_CLI_API_KEY.',
    names: ['QWEN_CLI_API_KEY'],
  },
  {
    id: 'gemini-cli',
    label: 'Gemini CLI',
    helper: 'Recommended: GOOGLE_API_KEY.',
    names: ['GOOGLE_API_KEY', 'GEMINI_CLI_API_KEY'],
  },
  {
    id: 'mistral-vibe',
    label: 'Mistral Vibe',
    helper: 'Recommended: MISTRAL_API_KEY.',
    names: ['MISTRAL_API_KEY', 'MISTRAL_VIBE_API_KEY'],
  },
  {
    id: 'kimi-code',
    label: 'Kimi Code',
    helper: 'Recommended: KIMI_API_KEY.',
    names: ['KIMI_API_KEY', 'KIMI_CODE_API_KEY', 'KIMI_CODE_ENDPOINT'],
  },
]

export const DEFAULT_SECRET_NAME_PRESET_GROUP_ID = 'claude-code'
