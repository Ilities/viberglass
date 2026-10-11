import type { Clanker } from '@/service/api/clanker-api'
import { collectSecretUsers, describeSecretUsers } from './secretUsers'

const TOKEN = 'token'

function agent(name: string, secretIds: string[]): Clanker {
  return {
    id: name,
    name,
    slug: name,
    description: null,
    deploymentStrategyId: null,
    deploymentStrategy: null,
    deploymentConfig: null,
    configFiles: [],
    agent: 'opencode',
    secretBindings: secretIds.map((secretId) => ({ envVar: 'KEY', secretId })),
    mcpServerIds: [],
    skillIds: [],
    status: 'active',
    statusMessage: null,
    createdAt: '2026-09-22T00:00:00.000Z',
    updatedAt: '2026-09-22T00:00:00.000Z',
  }
}

describe('secret users', () => {
  it('names the spaces and connection that read a token no agent uses', () => {
    const users = collectSecretUsers(
      [agent('Default agent', ['model-key'])],
      [
        { secretId: TOKEN, kind: 'space', name: 'Web shop' },
        { secretId: TOKEN, kind: 'space', name: 'Payments' },
        { secretId: TOKEN, kind: 'connection', name: 'GitHub' },
      ],
    )

    expect(describeSecretUsers(users.get(TOKEN))).toEqual(['Spaces: Web shop, Payments', 'Connection: GitHub'])
    expect(describeSecretUsers(users.get('model-key'))).toEqual(['Agent: Default agent'])
  })

  it('lists an agent once even when it binds the secret twice', () => {
    const users = collectSecretUsers([agent('Default agent', [TOKEN, TOKEN])], [])

    expect(describeSecretUsers(users.get(TOKEN))).toEqual(['Agent: Default agent'])
  })

  it('says nothing for a secret nothing reads', () => {
    expect(describeSecretUsers(undefined)).toEqual([])
  })
})
