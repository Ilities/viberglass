import { checkAsanaConnection } from '../src/backend/checkAsanaConnection'

describe('checkAsanaConnection', () => {
  afterEach(() => jest.restoreAllMocks())

  it('checks the current Asana user using a personal access token', async () => {
    const request = jest.spyOn(global, 'fetch').mockResolvedValue(new Response('{"data":{"gid":"1","name":"Bot"}}'))
    await checkAsanaConnection({ type: 'token', token: 'pat-test' })
    expect(request).toHaveBeenCalledWith('https://app.asana.com/api/1.0/users/me?opt_fields=gid,name', expect.objectContaining({
      headers: { Authorization: 'Bearer pat-test' },
    }))
  })

  it('reports Asana authentication errors', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(new Response('{"errors":[{"message":"Not Authorized"}]}', { status: 401 }))
    await expect(checkAsanaConnection({ type: 'token', token: 'bad' })).rejects.toThrow('Asana authentication failed: HTTP 401')
  })

  it('reports a missing token', async () => {
    await expect(checkAsanaConnection({ type: 'token' })).rejects.toThrow('The Asana connection has no personal access token')
  })
})
