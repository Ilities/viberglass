import { VerdaApiClient } from '../VerdaApiClient'
import { VerdaContainersHost, verdaDeploymentName } from '../VerdaContainersHost'
import { verdaStatus } from '../verdaStatus'
import { verdaFlavours } from '../verdaFlavours'

const account = { clientId: 'client', clientSecret: 'secret' }
const spec = {
  name: 'Qwen coder',
  model: 'Qwen/Qwen3-8B',
  flavour: { id: 'L40S', gpuCount: 1 },
  servingArgs: ['--tool-call-parser', 'hermes'],
  mode: 'scale-to-zero' as const,
}

interface Call {
  method: string
  path: string
  body?: unknown
  auth?: string
}

function fakeVerda(handler: (call: Call) => { status?: number; body?: unknown } | undefined = () => undefined) {
  const calls: Call[] = []
  const fetchFn = jest.fn(async (url: string, init: RequestInit) => {
    const path = url.replace('https://api.verda.com/v1', '')
    const headers = new Headers(init.headers)
    const call = {
      method: init.method ?? 'GET',
      path,
      body: init.body ? JSON.parse(String(init.body)) : undefined,
      auth: headers.get('Authorization') ?? undefined,
    }
    calls.push(call)
    if (path === '/oauth2/token') return Response.json({ access_token: 'token', expires_in: 3600 })
    const result = handler(call) ?? {}
    return new Response(result.body === undefined ? '' : JSON.stringify(result.body), {
      status: result.status ?? 200,
    })
  })
  return { calls, host: new VerdaContainersHost(new VerdaApiClient(fetchFn)), fetchFn }
}

describe('Verda container deployments', () => {
  test('names deployments as DNS labels with a unique suffix', () => {
    expect(verdaDeploymentName('Qwen3 Coder (EU)!', 'abc123')).toBe('qwen3-coder-eu-abc123')
    expect(verdaDeploymentName('***', 'abc123')).toBe('model-abc123')
    expect(verdaDeploymentName('x'.repeat(80), 'abc123').length).toBeLessThanOrEqual(63)
  })

  test('creates a scale-to-zero vLLM container and returns its OpenAI base URL', async () => {
    const { calls, host } = fakeVerda((call) =>
      call.path === '/container-deployments'
        ? { status: 201, body: { endpoint_base_url: 'https://containers.verda.com/qwen/' } }
        : undefined,
    )
    const created = await host.create(account, spec)
    expect(created.baseUrl).toBe('https://containers.verda.com/qwen/v1')
    expect(created.externalId).toMatch(/^qwen-coder-[0-9a-f]{6}$/)
    const create = calls.find((call) => call.path === '/container-deployments')
    expect(create?.auth).toBe('Bearer token')
    expect(create?.body).toMatchObject({
      compute: { name: 'L40S', size: 1 },
      scaling: { min_replica_count: 0, max_replica_count: 1 },
      containers: [
        {
          exposed_port: 8000,
          healthcheck: { enabled: true, port: 8000, path: '/health' },
          entrypoint_overrides: { enabled: true, cmd: ['Qwen/Qwen3-8B', '--tool-call-parser', 'hermes'] },
        },
      ],
    })
    expect(calls.some((call) => call.path === '/secrets')).toBe(false)
  })

  test('passes a Hugging Face token as a Verda secret and removes everything when creation fails', async () => {
    const { calls, host } = fakeVerda((call) =>
      call.path === '/container-deployments' ? { status: 400, body: { message: 'You must add balance' } } : undefined,
    )
    await expect(host.create({ ...account, huggingFaceToken: 'hf' }, spec)).rejects.toThrow(
      'POST /container-deployments failed on Verda (HTTP 400): You must add balance',
    )
    const secret = calls.find((call) => call.path === '/secrets')
    expect(secret?.body).toEqual({ name: expect.stringMatching(/-hf-token$/), value: 'hf' })
    const create = calls.find((call) => call.path === '/container-deployments')
    expect(JSON.stringify(create?.body)).toContain('"type":"secret"')
    expect(calls.filter((call) => call.method === 'DELETE').map((call) => call.path)).toEqual([
      expect.stringMatching(/^\/container-deployments\/qwen-coder-.*\?timeout=0$/),
      expect.stringMatching(/^\/secrets\/qwen-coder-.*-hf-token$/),
    ])
  })

  test('resumes a paused deployment before changing its scaling, and pauses to stop', async () => {
    const { calls, host } = fakeVerda((call) =>
      call.path.endsWith('/status') ? { body: { status: 'paused' } } : undefined,
    )
    await host.setMode(account, 'qwen', 'keep-warm')
    await host.setMode(account, 'qwen', 'stopped')
    expect(calls.filter((call) => call.path !== '/oauth2/token').map((call) => `${call.method} ${call.path}`)).toEqual([
      'GET /container-deployments/qwen/status',
      'POST /container-deployments/qwen/resume',
      'PATCH /container-deployments/qwen/scaling',
      'POST /container-deployments/qwen/pause',
    ])
    expect(calls.find((call) => call.method === 'PATCH')?.body).toMatchObject({ min_replica_count: 1 })
  })

  test('reuses its token until shortly before it expires', async () => {
    const { calls, host } = fakeVerda(() => ({ body: [] }))
    await host.listFlavours(account)
    await host.listFlavours(account)
    expect(calls.filter((call) => call.path === '/oauth2/token')).toHaveLength(1)
  })

  test('treats deleting a deployment that is already gone as done', async () => {
    const { host } = fakeVerda(() => ({ status: 404 }))
    await expect(host.delete(account, 'gone')).resolves.toBeUndefined()
  })

  test('reports a deployment missing on Verda as failed', async () => {
    const { host } = fakeVerda(() => ({ status: 404 }))
    await expect(host.getStatus(account, 'gone')).resolves.toEqual({
      state: 'failed',
      detail: 'The deployment no longer exists on Verda.',
    })
  })
})

describe('Verda status', () => {
  test.each([
    ['paused', [], 'stopped'],
    ['healthy', [], 'idle'],
    ['healthy', ['initializing'], 'waking'],
    ['healthy', ['running'], 'running'],
    ['initializing', [], 'creating'],
    ['quota_reached', [], 'failed'],
    ['terminating', [], 'unknown'],
  ])('%s with replicas %j is %s', (status, replicas, state) => {
    expect(verdaStatus(status, replicas).state).toBe(state)
  })
})

describe('Verda flavours', () => {
  test('joins compute resources to prices, drops CPU nodes and marks recipe hardware', () => {
    const flavours = verdaFlavours(
      [
        { name: 'H100', size: 1, is_available: true },
        { name: 'L40S', size: 1, is_available: false },
        { name: 'CPU Node', size: 8, is_available: true },
      ],
      [
        {
          model: 'H100',
          name: 'H100 SXM5 80GB',
          gpu: { number_of_gpus: 1 },
          gpu_memory: { size_in_gigabytes: 80 },
          serverless_price: '3.68',
          currency: 'eur',
        },
        {
          model: 'L40S',
          name: 'L40S 48GB',
          gpu: { number_of_gpus: 1 },
          gpu_memory: { size_in_gigabytes: 48 },
          serverless_price: '1.52',
          currency: 'eur',
        },
        {
          model: 'CPU Node',
          name: 'AMD Rome+',
          gpu: { number_of_gpus: 0 },
          gpu_memory: { size_in_gigabytes: 0 },
          serverless_price: '0.09',
          currency: 'eur',
        },
      ],
    )
    expect(flavours).toEqual([
      {
        id: 'L40S',
        gpuCount: 1,
        gpu: 'L40S 48GB',
        vramGb: 48,
        pricePerHour: 1.52,
        currency: 'EUR',
        available: false,
        recipeHardware: null,
      },
      {
        id: 'H100',
        gpuCount: 1,
        gpu: 'H100 SXM5 80GB',
        vramGb: 80,
        pricePerHour: 3.68,
        currency: 'EUR',
        available: true,
        recipeHardware: 'h100',
      },
    ])
  })
})
