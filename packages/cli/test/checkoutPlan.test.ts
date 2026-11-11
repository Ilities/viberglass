import { execFileSync } from 'child_process'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { checkoutPlan, handBackNote, sameRepository } from '../src/checkoutPlan'

const BRANCH = { branch: 'viberglass/t-1', repositoryUrl: 'https://github.com/acme/web', baseBranch: 'main', pushed: true, takenOver: null }

describe('checkoutPlan', () => {
  it('fetches the pushed branch and switches to it, tracking origin', () => {
    expect(checkoutPlan(BRANCH)).toEqual([
      ['fetch', 'origin', 'viberglass/t-1'],
      ['switch', '--track', '-C', 'viberglass/t-1', 'origin/viberglass/t-1'],
    ])
  })

  it("starts the branch from the base branch when no build has pushed it, with origin's task branch as upstream", () => {
    expect(checkoutPlan({ ...BRANCH, pushed: false })).toEqual([
      ['fetch', 'origin', 'main'],
      ['switch', '--no-track', '-c', 'viberglass/t-1', 'origin/main'],
      ['config', 'branch.viberglass/t-1.remote', 'origin'],
      ['config', 'branch.viberglass/t-1.merge', 'refs/heads/viberglass/t-1'],
    ])
  })

  it('makes a plain git push create the task branch on origin and leave the base branch alone', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'checkout-plan-'))
    const run = (cwd: string, ...args: string[]) =>
      execFileSync('git', ['-c', 'user.name=Dev', '-c', 'user.email=dev@example.com', ...args], { cwd, encoding: 'utf-8', stdio: 'pipe' })
    const origin = path.join(root, 'origin.git')
    run(root, 'init', '--bare', '--initial-branch=main', origin)
    const seed = path.join(root, 'seed')
    run(root, 'clone', origin, seed)
    fs.writeFileSync(path.join(seed, 'app.js'), '1\n')
    run(seed, 'add', '.')
    run(seed, 'commit', '-m', 'Initial')
    run(seed, 'push', 'origin', 'HEAD:main')
    const clone = path.join(root, 'clone')
    run(root, 'clone', origin, clone)

    for (const command of checkoutPlan({ ...BRANCH, pushed: false })) run(clone, ...command)
    fs.writeFileSync(path.join(clone, 'app.js'), '2\n')
    run(clone, 'commit', '-am', 'Change')
    run(clone, '-c', 'push.default=simple', 'push')

    expect(run(origin, 'rev-parse', 'viberglass/t-1')).toBe(run(clone, 'rev-parse', 'HEAD'))
    expect(run(origin, 'rev-parse', 'main')).toBe(run(seed, 'rev-parse', 'HEAD'))
  })
})

describe('handBackNote', () => {
  it('says the branch is new and how to push it when no build has pushed it', () => {
    const note = handBackNote({ ...BRANCH, pushed: false, takenOver: { by: { id: 'u-1', name: 'Dev Patel' }, at: '2026-11-11T17:06:58Z' } })
    expect(note).toContain('started from origin/main')
    expect(note).toContain('your first push creates origin/viberglass/t-1')
    expect(note).toContain('Dev Patel has the work.')
    expect(note).toContain('git push -u origin viberglass/t-1')
  })

  it('names the tracked branch when a build pushed it', () => {
    expect(handBackNote(BRANCH)).toContain('On viberglass/t-1, tracking origin/viberglass/t-1.')
  })
})

describe('sameRepository', () => {
  it('matches a clone over ssh or https, with or without .git', () => {
    expect(sameRepository('git@github.com:acme/web.git', 'https://github.com/acme/web')).toBe(true)
    expect(sameRepository('https://x-access-token:abc@github.com/Acme/web.git', 'https://github.com/acme/web')).toBe(true)
    expect(sameRepository('https://github.com/acme/other', 'https://github.com/acme/web')).toBe(false)
  })
})
