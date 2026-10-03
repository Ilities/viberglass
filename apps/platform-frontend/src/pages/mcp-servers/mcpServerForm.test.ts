import { formStateOf, inputOf, newHeaderRow } from './mcpServerForm'

describe('MCP server form', () => {
  it('turns header rows into plain and secret headers', () => {
    const form = formStateOf()
    const bearer = { ...newHeaderRow(), secretId: 's1' }
    const team = { ...newHeaderRow(), name: 'X-Team', kind: 'value' as const, value: 'web' }
    const { input, error } = inputOf({ ...form, name: ' linear ', url: 'https://mcp.linear.app/mcp', headers: [bearer, team] })
    expect(error).toBeNull()
    expect(input).toEqual({
      name: 'linear',
      description: null,
      url: 'https://mcp.linear.app/mcp',
      headers: [
        { name: 'Authorization', secretId: 's1', prefix: 'Bearer ' },
        { name: 'X-Team', value: 'web' },
      ],
    })
  })

  it('asks for the secret of a secret header', () => {
    const { error } = inputOf({ ...formStateOf(), name: 'a', url: 'https://a', headers: [newHeaderRow()] })
    expect(error).toBe('Pick the secret for the Authorization header.')
  })

  it('reads a saved server back into rows', () => {
    const form = formStateOf({
      id: '1',
      name: 'gh',
      url: 'https://api.githubcopilot.com/mcp/',
      headers: [{ name: 'Authorization', secretId: 's1', prefix: 'Bearer ' }],
      createdAt: '',
      updatedAt: '',
    })
    expect(form.headers[0]).toMatchObject({ name: 'Authorization', kind: 'secret', secretId: 's1', prefix: 'Bearer ' })
  })
})
