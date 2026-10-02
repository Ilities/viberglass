import type { Secret } from '@/service/api/secret-api'
import { summarizeRunner } from './runnerSummary'

const key: Secret = {
  id: 'key',
  name: 'Team OpenRouter key',
  provider: 'openrouter',
  secretLocation: 'database',
  secretPath: null,
  createdAt: '',
  updatedAt: '',
}

describe('summarizeRunner', () => {
  it('reports the provider, model and key the runner uses', () => {
    const summary = summarizeRunner(
      {
        agent: 'opencode',
        deploymentConfig: { version: 1, strategy: { type: 'docker' }, agent: { type: 'opencode', model: 'openrouter/x' } },
        secretBindings: [{ envVar: 'OPENROUTER_API_KEY', secretId: 'key' }],
      },
      [key],
    )

    expect(summary).toMatchObject({
      providerLabel: 'OpenRouter',
      model: 'openrouter/x',
      key: { label: 'Team OpenRouter key', envVar: 'OPENROUTER_API_KEY' },
      problem: null,
    })
  })

  it('flags a runner without a key its agent reads', () => {
    const summary = summarizeRunner(
      { agent: 'claude-code', deploymentConfig: null, secretBindings: [{ envVar: 'NOTION_TOKEN', secretId: 'n' }] },
      [],
    )

    expect(summary.problem).toContain('No model key')
    expect(summary.extras).toEqual([{ envVar: 'NOTION_TOKEN', secretId: 'n' }])
  })

  it('needs no key for the test agent', () => {
    expect(summarizeRunner({ agent: 'fake', deploymentConfig: null, secretBindings: [] }, []).problem).toBeNull()
  })

  it('needs no key for Codex on a ChatGPT login', () => {
    const summary = summarizeRunner(
      {
        agent: 'codex',
        deploymentConfig: {
          version: 1,
          strategy: { type: 'docker' },
          agent: { type: 'codex', codexAuth: { mode: 'chatgpt_device', secretName: 'CODEX_AUTH_JSON' } },
        },
        secretBindings: [],
      },
      [],
    )

    expect(summary).toMatchObject({ usesChatGptLogin: true, problem: null })
  })
})
