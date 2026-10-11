import type { RunRecord } from '@viberglass/types'
import { runFactsLine } from './run-facts-line'

function record(overrides: Partial<RunRecord> = {}): RunRecord {
  return {
    jobId: 'job-1', jobKind: 'planning', projectSlug: 'web', ticketId: 't', ticketTitle: 'Task', clankerName: 'Default agent', clankerSlug: 'default',
    requestedAgent: 'opencode', agent: 'opencode', modelSnapshot: 'zai/glm-4.7-flash', harnessVersion: '1.18.34', repository: 'r', baseBranch: 'main',
    branch: null, baseSha: null, commitSha: null, workerType: 'docker', computeImage: null, configHash: null, instructionsHash: null, promptHash: null,
    promptCharacters: null, changedFileCount: null, success: true, stopReason: 'completed', errorMessage: null, usageAvailable: true,
    usage: { inputTokens: 24100, outputTokens: 3100, reasoningOutputTokens: null, cacheReadInputTokens: 12000, cacheCreationInputTokens: null },
    costUsd: 0.0123, costProvenance: 'actual', dispatchedAt: 't', startedAt: null, finishedAt: null, durationMs: 278000, manifestVersion: 1, pullRequest: null,
    ...overrides,
  }
}

describe('runFactsLine', () => {
  it('says the model, how long it took, its tokens and what it cost', () => {
    expect(runFactsLine(record())).toEqual(['zai/glm-4.7-flash', '4m 38s', '24,100 input tokens', '3,100 output tokens', '12,000 cached', '$0.01'])
  })

  it("says so when the run didn't report usage or cost", () => {
    expect(runFactsLine(record({ usageAvailable: false, usage: null, costUsd: null, costProvenance: 'unavailable', modelSnapshot: null, durationMs: 12000 }))).toEqual([
      '12s',
      'cost not reported',
    ])
  })
})
