import { summarizeRunner } from '@/pages/clankers/config/runnerSummary'
import type { Clanker } from '@/service/api/clanker-api'
import type { SecretUse } from '@/service/api/secret-api'

/** Everything that reads one secret, by kind, as names people recognise. */
export interface SecretUsers {
  agents: string[]
  spaces: string[]
  connections: string[]
  endpoints: string[]
}

const KIND_KEY: Record<SecretUse['kind'], keyof SecretUsers> = {
  space: 'spaces',
  connection: 'connections',
  model_endpoint: 'endpoints',
}

const KIND_LABEL: Record<keyof SecretUsers, [one: string, many: string]> = {
  agents: ['Agent', 'Agents'],
  spaces: ['Space', 'Spaces'],
  connections: ['Connection', 'Connections'],
  endpoints: ['Model endpoint', 'Model endpoints'],
}

export function collectSecretUsers(agents: Clanker[], uses: SecretUse[]): Map<string, SecretUsers> {
  const users = new Map<string, SecretUsers>()
  const add = (secretId: string, key: keyof SecretUsers, name: string) => {
    const entry = users.get(secretId) ?? { agents: [], spaces: [], connections: [], endpoints: [] }
    if (!entry[key].includes(name)) entry[key].push(name)
    users.set(secretId, entry)
  }
  for (const agent of agents) {
    for (const binding of agent.secretBindings) add(binding.secretId, 'agents', agent.name)
    const loginSecretId = summarizeRunner(agent, []).loginSecretId
    if (loginSecretId) add(loginSecretId, 'agents', agent.name)
  }
  for (const use of uses) add(use.secretId, KIND_KEY[use.kind], use.name)
  return users
}

/** One line per kind, such as "Spaces: Web shop, Payments"; empty when nothing reads the secret. */
export function describeSecretUsers(users: SecretUsers | undefined): string[] {
  if (!users) return []
  const kinds: Array<keyof SecretUsers> = ['agents', 'spaces', 'connections', 'endpoints']
  return kinds
    .filter((kind) => users[kind].length > 0)
    .map((kind) => `${KIND_LABEL[kind][users[kind].length === 1 ? 0 : 1]}: ${users[kind].join(', ')}`)
}
