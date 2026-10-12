import { getHarnessConfigFile } from '../instructionFiles'
import { describeJsonProblem, findReferencedEnvVars, formatReference } from './harnessReferences'

describe('harnessReferences', () => {
  test('writes references in each file’s own syntax', () => {
    expect(formatReference(['{env:NAME}'], 'OPENAI_API_KEY')).toBe('{env:OPENAI_API_KEY}')
    expect(formatReference(['$NAME', '${NAME}'], 'OPENAI_API_KEY')).toBe('$OPENAI_API_KEY')
  })

  test('finds the variables a file refers to', () => {
    expect(findReferencedEnvVars(['{env:NAME}'], '{"a": "{env:A}", "b": "{env:B}", "c": "{env:A}"}')).toEqual(['A', 'B'])
    expect(findReferencedEnvVars(['$NAME', '${NAME}'], '{"apiKey": "${ZAI_API_KEY}"}')).toEqual(['ZAI_API_KEY'])
  })

  test('offers the config file editors the harnesses declare', () => {
    expect(getHarnessConfigFile('opencode')?.referenceHint).toBe('Refer to an attached secret as {env:SECRET_NAME}.')
    expect(getHarnessConfigFile('pi')?.fileType).toBe('pi/models.json')
    expect(getHarnessConfigFile('claude-code')).toBeUndefined()
  })

  test('reports invalid JSON', () => {
    expect(describeJsonProblem('{"a": }')).not.toBeNull()
    expect(describeJsonProblem('{"a": 1}')).toBeNull()
    expect(describeJsonProblem('')).toBeNull()
  })
})
