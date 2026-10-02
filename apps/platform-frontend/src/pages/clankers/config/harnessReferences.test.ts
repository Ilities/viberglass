import { describeJsonProblem, findReferencedEnvVars, formatReference } from './harnessReferences'

describe('harnessReferences', () => {
  test('writes references in each file’s own syntax', () => {
    expect(formatReference('opencode.json', 'OPENAI_API_KEY')).toBe('{env:OPENAI_API_KEY}')
    expect(formatReference('pi/models.json', 'OPENAI_API_KEY')).toBe('$OPENAI_API_KEY')
  })

  test('finds the variables a file refers to', () => {
    expect(findReferencedEnvVars('opencode.json', '{"a": "{env:A}", "b": "{env:B}", "c": "{env:A}"}')).toEqual(['A', 'B'])
    expect(findReferencedEnvVars('pi/models.json', '{"apiKey": "${ZAI_API_KEY}"}')).toEqual(['ZAI_API_KEY'])
  })

  test('reports invalid JSON', () => {
    expect(describeJsonProblem('{"a": }')).not.toBeNull()
    expect(describeJsonProblem('{"a": 1}')).toBeNull()
    expect(describeJsonProblem('')).toBeNull()
  })
})
