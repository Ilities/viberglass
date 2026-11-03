import { RepositoryAccessError } from '@viberglass/integration-core'
import { GitHubRepositoryHost } from '../../src/backend/repository/GitHubRepositoryHost'

interface Reply {
  status: number
  body: unknown
  headers?: Record<string, string>
}

/** Answers each request by "METHOD path"; anything unlisted is a 404. */
function gitHub(routes: Record<string, Reply>) {
  return jest.fn(async (url: string, init: RequestInit) => {
    const path = url.replace('https://api.github.com', '')
    const reply = routes[`${init.method ?? 'GET'} ${path}`] ?? { status: 404, body: { message: 'Not Found' } }
    return { ok: reply.status < 400, status: reply.status, headers: new Headers(reply.headers ?? {}), json: async () => reply.body }
  })
}

function creator(fetch: ReturnType<typeof gitHub> | jest.Mock) {
  const { creator } = new GitHubRepositoryHost({ fetch, apiBaseUrl: 'https://api.github.com' })
  return creator
}

const ME = { 'GET /user': { status: 200, body: { login: 'jane' } } }
const CREATED = {
  status: 201,
  body: { full_name: 'acme/laptops', html_url: 'https://github.com/acme/laptops', default_branch: 'main', private: true },
}

async function failure(promise: Promise<unknown>): Promise<RepositoryAccessError> {
  const error = await promise.then(() => null, (caught: unknown) => caught)
  if (!(error instanceof RepositoryAccessError)) throw new Error(`Expected a RepositoryAccessError, got ${String(error)}`)
  return error
}

describe('GitHubRepositoryHost.creator.listOwners', () => {
  it("lists the token's account first, then its organisations", async () => {
    const fetch = gitHub({ ...ME, 'GET /user/orgs?per_page=100': { status: 200, body: [{ login: 'acme' }, { login: 'globex' }] } })

    await expect(creator(fetch).listOwners('tok')).resolves.toEqual([
      { name: 'jane', kind: 'user' },
      { name: 'acme', kind: 'organization' },
      { name: 'globex', kind: 'organization' },
    ])
  })

  it("offers just the token's account when it can't list organisations", async () => {
    const fetch = gitHub({ ...ME, 'GET /user/orgs?per_page=100': { status: 403, body: { message: 'Resource not accessible' } } })

    await expect(creator(fetch).listOwners('tok')).resolves.toEqual([{ name: 'jane', kind: 'user' }])
  })

  it('says when GitHub rejects the token', async () => {
    const error = await failure(creator(gitHub({ 'GET /user': { status: 401, body: {} } })).listOwners('tok'))

    expect(error.code).toBe('TOKEN_REJECTED')
  })
})

describe('GitHubRepositoryHost.creator.createRepository', () => {
  it('creates a private repository with a README in an organisation', async () => {
    const fetch = gitHub({ ...ME, 'POST /orgs/acme/repos': CREATED })

    await expect(creator(fetch).createRepository({ owner: 'acme', name: 'laptops' }, 'tok')).resolves.toEqual({
      fullName: 'acme/laptops',
      url: 'https://github.com/acme/laptops',
      defaultBranch: 'main',
      isPrivate: true,
    })
    const [, init] = fetch.mock.calls.find(([url]) => url.endsWith('/orgs/acme/repos')) ?? []
    expect(JSON.parse(String(init?.body))).toEqual({ name: 'laptops', private: true, auto_init: true })
  })

  it("creates under the token's own account through /user/repos, whatever the owner's case", async () => {
    const fetch = gitHub({ ...ME, 'POST /user/repos': { ...CREATED, body: { ...CREATED.body, full_name: 'jane/laptops' } } })

    const created = await creator(fetch).createRepository({ owner: 'Jane', name: 'laptops' }, 'tok')

    expect(created.fullName).toBe('jane/laptops')
  })

  it('refuses a name GitHub would rewrite, without calling GitHub', async () => {
    const fetch = gitHub(ME)

    const error = await failure(creator(fetch).createRepository({ owner: 'acme', name: 'laptop tracker' }, 'tok'))

    expect(error.code).toBe('REPOSITORY_NAME_INVALID')
    expect(fetch).not.toHaveBeenCalled()
  })

  it('says what the token needs when the organisation refuses', async () => {
    const fetch = gitHub({ ...ME, 'POST /orgs/acme/repos': { status: 403, body: { message: 'Must have admin rights' } } })

    const error = await failure(creator(fetch).createRepository({ owner: 'acme', name: 'laptops' }, 'tok'))

    expect(error.code).toBe('CREATE_FORBIDDEN')
    expect(error.message).toMatch(/^This token can't create repositories in acme: a fine-grained token needs acme as its resource owner/)
    expect(error.message).toContain('the repo scope')
  })

  it('reads a 404 from GitHub as the token not being allowed to create there', async () => {
    const error = await failure(creator(gitHub(ME)).createRepository({ owner: 'acme', name: 'laptops' }, 'tok'))

    expect(error.code).toBe('CREATE_FORBIDDEN')
  })

  it('says when the name is taken', async () => {
    const fetch = gitHub({
      ...ME,
      'POST /orgs/acme/repos': {
        status: 422,
        body: { message: 'Repository creation failed.', errors: [{ field: 'name', message: 'name already exists on this account' }] },
      },
    })

    const error = await failure(creator(fetch).createRepository({ owner: 'acme', name: 'laptops' }, 'tok'))

    expect(error.code).toBe('REPOSITORY_EXISTS')
    expect(error.message).toContain('acme/laptops')
  })

  it('says when GitHub is rate limiting the token', async () => {
    const fetch = gitHub({ ...ME, 'POST /orgs/acme/repos': { status: 403, body: {}, headers: { 'x-ratelimit-remaining': '0' } } })

    const error = await failure(creator(fetch).createRepository({ owner: 'acme', name: 'laptops' }, 'tok'))

    expect(error.code).toBe('HOST_RATE_LIMITED')
  })

  it("says when GitHub can't be reached", async () => {
    const fetch = jest.fn(async () => {
      throw new Error('ECONNREFUSED')
    })

    const error = await failure(creator(fetch).createRepository({ owner: 'acme', name: 'laptops' }, 'tok'))

    expect(error.code).toBe('HOST_UNREACHABLE')
  })
})
