/**
 * Model providers: who issues an API key, and how to check one.
 *
 * A provider is one kind of key plus its endpoint, so a vendor with several
 * key types (Kimi Code vs Moonshot platform, Alibaba pay-as-you-go vs Coding
 * Plan) has several entries. Ids follow models.dev where OpenCode uses them,
 * so an OpenCode model is written `<provider id>/<model>`.
 *
 * Which harness runs a provider's key lives with the agent plugins (see
 * `agentProviders.ts`). Adding a provider here is data only.
 */

export type ModelProviderId =
  | 'anthropic'
  | 'openai'
  | 'google'
  | 'mistral'
  | 'alibaba'
  | 'alibaba-coding-plan'
  | 'kimi-code'
  | 'moonshotai'
  | 'opencode-go'
  | 'openrouter'
  | 'deepseek'
  | 'xai'
  | 'groq'
  | 'fake'

/** How the key is sent on the check request. */
export type ModelKeyAuth = { scheme: 'bearer' } | { scheme: 'header'; header: string }

export interface ModelKeyCheck {
  /** A request that needs a valid key: usually GET on the model list. */
  url: string
  /**
   * Env var holding the base URL that `url` is relative to. A provider with
   * one is offered only when the variable is set (used by the test provider).
   */
  baseUrlEnv?: string
  auth: ModelKeyAuth
  headers?: Record<string, string>
  /**
   * For providers whose model list is public: POST a deliberately incomplete
   * request (nothing is generated). A valid key gets past authentication and
   * the request is refused with one of `acceptedStatuses`.
   */
  post?: { body: Record<string, unknown>; acceptedStatuses: number[] }
}

export interface ModelProvider {
  id: ModelProviderId
  displayName: string
  /** Where a person creates a key. */
  keyUrl: string
  /**
   * Prefixes only this provider's keys start with. Used to pre-select the
   * provider and to catch a key pasted under the wrong one. Empty when the
   * provider's keys share a generic prefix such as `sk-`.
   */
  keyPrefixes: string[]
  keyCheck: ModelKeyCheck
}

const bearer: ModelKeyAuth = { scheme: 'bearer' }

export const MODEL_PROVIDERS: readonly ModelProvider[] = [
  {
    id: 'anthropic',
    displayName: 'Anthropic',
    keyUrl: 'https://console.anthropic.com/settings/keys',
    keyPrefixes: ['sk-ant-'],
    keyCheck: {
      url: 'https://api.anthropic.com/v1/models',
      auth: { scheme: 'header', header: 'x-api-key' },
      headers: { 'anthropic-version': '2023-06-01' },
    },
  },
  {
    id: 'openai',
    displayName: 'OpenAI',
    keyUrl: 'https://platform.openai.com/api-keys',
    keyPrefixes: [],
    keyCheck: { url: 'https://api.openai.com/v1/models', auth: bearer },
  },
  {
    id: 'google',
    displayName: 'Google Gemini',
    keyUrl: 'https://aistudio.google.com/app/apikey',
    keyPrefixes: ['AIza'],
    keyCheck: {
      url: 'https://generativelanguage.googleapis.com/v1beta/models',
      auth: { scheme: 'header', header: 'x-goog-api-key' },
    },
  },
  {
    id: 'mistral',
    displayName: 'Mistral',
    keyUrl: 'https://console.mistral.ai/api-keys',
    keyPrefixes: [],
    keyCheck: { url: 'https://api.mistral.ai/v1/models', auth: bearer },
  },
  {
    id: 'alibaba',
    displayName: 'Alibaba Cloud Model Studio (Qwen)',
    keyUrl: 'https://modelstudio.console.alibabacloud.com/?tab=playground#/api-key',
    keyPrefixes: [],
    keyCheck: { url: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1/models', auth: bearer },
  },
  {
    id: 'alibaba-coding-plan',
    displayName: 'Alibaba Coding Plan (Qwen)',
    keyUrl: 'https://modelstudio.console.alibabacloud.com/?tab=coding-plan',
    keyPrefixes: ['sk-sp-'],
    // The model list is public, so check the key on a completion without a model.
    keyCheck: {
      url: 'https://coding-intl.dashscope.aliyuncs.com/v1/chat/completions',
      auth: bearer,
      post: { body: {}, acceptedStatuses: [400] },
    },
  },
  {
    id: 'kimi-code',
    displayName: 'Kimi Code',
    keyUrl: 'https://www.kimi.com/code',
    keyPrefixes: [],
    keyCheck: { url: 'https://api.kimi.com/coding/v1/models', auth: bearer },
  },
  {
    id: 'moonshotai',
    displayName: 'Moonshot AI (Kimi API)',
    keyUrl: 'https://platform.moonshot.ai/console/api-keys',
    keyPrefixes: [],
    keyCheck: { url: 'https://api.moonshot.ai/v1/models', auth: bearer },
  },
  {
    id: 'opencode-go',
    displayName: 'OpenCode Go',
    keyUrl: 'https://opencode.ai/auth',
    keyPrefixes: [],
    // The model list is public, and the model is checked before the key, so
    // name a real model and send no messages.
    keyCheck: {
      url: 'https://opencode.ai/zen/go/v1/chat/completions',
      auth: bearer,
      post: { body: { model: 'deepseek-v4.1-flash', messages: [] }, acceptedStatuses: [400] },
    },
  },
  {
    id: 'openrouter',
    displayName: 'OpenRouter',
    keyUrl: 'https://openrouter.ai/keys',
    keyPrefixes: ['sk-or-'],
    // The model list is public; the key endpoint is the one that needs a valid key.
    keyCheck: { url: 'https://openrouter.ai/api/v1/key', auth: bearer },
  },
  {
    id: 'deepseek',
    displayName: 'DeepSeek',
    keyUrl: 'https://platform.deepseek.com/api_keys',
    keyPrefixes: [],
    keyCheck: { url: 'https://api.deepseek.com/models', auth: bearer },
  },
  {
    id: 'xai',
    displayName: 'xAI (Grok)',
    keyUrl: 'https://console.x.ai',
    keyPrefixes: ['xai-'],
    keyCheck: { url: 'https://api.x.ai/v1/models', auth: bearer },
  },
  {
    // Test only (e2e): runs on the fake agent; offered when its check URL is configured.
    id: 'fake',
    displayName: 'Fake provider (tests)',
    keyUrl: 'https://example.invalid/keys',
    keyPrefixes: [],
    keyCheck: { url: '/v1/models', auth: bearer, baseUrlEnv: 'VIBERGLASS_FAKE_PROVIDER_URL' },
  },
  {
    id: 'groq',
    displayName: 'Groq',
    keyUrl: 'https://console.groq.com/keys',
    keyPrefixes: ['gsk_'],
    keyCheck: { url: 'https://api.groq.com/openai/v1/models', auth: bearer },
  },
]

const providersById = new Map<string, ModelProvider>(MODEL_PROVIDERS.map((p) => [p.id, p]))

export function isModelProviderId(value: unknown): value is ModelProviderId {
  return typeof value === 'string' && providersById.has(value)
}

export function getModelProvider(id: ModelProviderId): ModelProvider {
  const provider = providersById.get(id)
  if (!provider) throw new Error(`Unknown model provider: ${id}`)
  return provider
}

/** The provider whose distinctive prefix the key starts with; the longest prefix wins. */
export function guessModelProviderFromKey(key: string): ModelProvider | undefined {
  const trimmed = key.trim()
  let best: { provider: ModelProvider; length: number } | undefined
  for (const provider of MODEL_PROVIDERS) {
    for (const prefix of provider.keyPrefixes) {
      if (trimmed.startsWith(prefix) && (!best || prefix.length > best.length)) {
        best = { provider, length: prefix.length }
      }
    }
  }
  return best?.provider
}

/**
 * A plain-language problem with the key's format for the chosen provider, or
 * null. Only distinctive prefixes are checked, so a generic `sk-` key passes.
 */
export function describeModelKeyFormatProblem(providerId: ModelProviderId, key: string): string | null {
  const provider = getModelProvider(providerId)
  const trimmed = key.trim()
  if (!trimmed) return 'Paste an API key.'
  if (/\s/.test(trimmed)) return "An API key doesn't contain spaces. Check that only the key was pasted."

  const guessed = guessModelProviderFromKey(trimmed)
  if (guessed && guessed.id !== provider.id) {
    return `This looks like a key from ${guessed.displayName}, not ${provider.displayName}.`
  }
  if (provider.keyPrefixes.length > 0 && !provider.keyPrefixes.some((p) => trimmed.startsWith(p))) {
    return `${provider.displayName} keys start with ${provider.keyPrefixes.join(' or ')}.`
  }
  return null
}
