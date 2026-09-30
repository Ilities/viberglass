import type { RunPullRequestOutcome, RunRecord } from '@viberglass/types'
import {
  formatAgentName,
  formatHarness,
  formatPullRequestState,
  formatRunCost,
  formatRunResult,
  formatTokenSummary,
  runRecordHref,
} from './run-record-format'

function record(overrides: Partial<RunRecord> = {}): RunRecord {
  return {
    jobId: 'job-1', jobKind: 'execution', projectSlug: 'acme', ticketId: 'ticket-1', ticketTitle: 'Fix it', clankerName: 'OpenCode Local', clankerSlug: 'opencode-local',
    requestedAgent: 'opencode', agent: 'opencode', modelSnapshot: null, harnessVersion: null,
    repository: 'https://github.com/acme/app', baseBranch: 'main', branch: null, baseSha: null, commitSha: null,
    workerType: 'docker', computeImage: null, configHash: null, instructionsHash: null, promptHash: null,
    promptCharacters: null, changedFileCount: null, success: true, stopReason: null, errorMessage: null,
    usageAvailable: false, usage: null, costUsd: null, costProvenance: 'unavailable',
    dispatchedAt: '2026-09-30T10:00:00.000Z', startedAt: null, finishedAt: null, durationMs: null,
    manifestVersion: 1, pullRequest: null,
    ...overrides,
  }
}

function pullRequest(overrides: Partial<RunPullRequestOutcome> = {}): RunPullRequestOutcome {
  return {
    url: 'https://github.com/acme/app/pull/1', state: 'open', mergedAt: null, closedAt: null,
    commentCount: 0, reviewCommentCount: 0, checkedAt: '2026-09-30T11:00:00.000Z', lastError: null,
    ...overrides,
  }
}

describe('runRecordHref', () => {
  it('opens a task run on its task, at its record', () => {
    expect(runRecordHref(record())).toBe('/spaces/acme/tasks/ticket-1?run=job-1&runTab=record')
  })

  it('opens a schedule run on its own page, at its record', () => {
    expect(runRecordHref(record({ ticketId: null }))).toBe('/spaces/acme/runs/job-1?runTab=record')
  })

  it('has no link when the space is gone', () => {
    expect(runRecordHref(record({ projectSlug: null }))).toBeNull()
  })
})

describe('formatAgentName', () => {
  it('uses the Viberglass name of the agent', () => {
    expect(formatAgentName(record())).toBe('OpenCode Local')
  })

  it('falls back to the harness when the agent is gone', () => {
    expect(formatAgentName(record({ clankerName: null }))).toBe('opencode')
  })
})

describe('formatHarness', () => {
  it('names the harness with its version when reported', () => {
    expect(formatHarness(record({ harnessVersion: '1.18.25' }))).toBe('opencode 1.18.25')
  })

  it('names the harness alone otherwise', () => {
    expect(formatHarness(record())).toBe('opencode')
  })
})

describe('formatRunResult', () => {
  it.each([
    [true, 'Succeeded'],
    [false, 'Failed'],
    [null, 'No result'],
  ])('labels success %s as %s', (success, label) => {
    expect(formatRunResult(record({ success })).label).toBe(label)
  })
})

describe('formatPullRequestState', () => {
  it('is null without a pull request', () => {
    expect(formatPullRequestState(record())).toBeNull()
  })

  it.each([
    ['merged', 'Merged'],
    ['closed', 'Closed'],
    ['open', 'Open'],
  ] as const)('labels %s', (state, label) => {
    expect(formatPullRequestState(record({ pullRequest: pullRequest({ state }) }))?.label).toBe(label)
  })

  it('tells an unchecked PR from one whose check failed', () => {
    expect(formatPullRequestState(record({ pullRequest: pullRequest({ state: null, checkedAt: null }) }))?.label).toBe('Not checked')
    expect(formatPullRequestState(record({ pullRequest: pullRequest({ state: null, lastError: 'GitHub returned 404' }) }))?.label).toBe('Check failed')
  })
})

describe('formatRunCost', () => {
  it('marks a measured cost', () => {
    expect(formatRunCost(record({ costUsd: 0.0011692, costProvenance: 'actual' }))).toEqual({ amount: '$0.0012', provenance: 'measured' })
  })

  it('marks an estimate as an estimate', () => {
    expect(formatRunCost(record({ costUsd: 0.7, costProvenance: 'estimated' }))).toEqual({ amount: '$0.70', provenance: 'estimate' })
  })

  it('shows no amount when nothing was measured', () => {
    expect(formatRunCost(record({ costUsd: null, costProvenance: 'unavailable' }))).toEqual({ amount: null, provenance: 'not measured' })
  })
})

describe('formatTokenSummary', () => {
  const usage = { inputTokens: 7748, outputTokens: 14, reasoningOutputTokens: 0, cacheReadInputTokens: null, cacheCreationInputTokens: null }

  it('summarises reported usage', () => {
    expect(formatTokenSummary(record({ usageAvailable: true, usage }))).toBe('7,748 in · 14 out')
  })

  it('is null when the CLI reported none', () => {
    expect(formatTokenSummary(record({ usageAvailable: false, usage: null }))).toBeNull()
  })
})
