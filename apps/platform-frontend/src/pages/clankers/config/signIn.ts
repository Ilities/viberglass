import { getAgentSignInMethods, type AgentSignInMethod, type AgentType } from '@viberglass/types'

/** The interactive sign-in the runner chose, if its harness declares it; null means an API key. */
export function chosenSignInMethod(agent: AgentType | '', signInMethod: string): AgentSignInMethod | null {
  if (!agent || !signInMethod) return null
  return getAgentSignInMethods(agent).find((method) => method.id === signInMethod) ?? null
}
