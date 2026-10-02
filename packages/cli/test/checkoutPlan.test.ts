import { checkoutPlan, sameRepository } from '../src/checkoutPlan'

const BRANCH = { branch: 'viberator/t-1', repositoryUrl: 'https://github.com/acme/web', baseBranch: 'main', pushed: true, takenOver: null }

describe('checkoutPlan', () => {
  it('fetches the pushed branch and switches to it, tracking origin', () => {
    expect(checkoutPlan(BRANCH)).toEqual([
      ['fetch', 'origin', 'viberator/t-1'],
      ['switch', '--track', '-C', 'viberator/t-1', 'origin/viberator/t-1'],
    ])
  })

  it('starts the branch from the base branch when no build has pushed it', () => {
    expect(checkoutPlan({ ...BRANCH, pushed: false })).toEqual([
      ['fetch', 'origin', 'main'],
      ['switch', '-c', 'viberator/t-1', 'origin/main'],
    ])
  })
})

describe('sameRepository', () => {
  it('matches a clone over ssh or https, with or without .git', () => {
    expect(sameRepository('git@github.com:acme/web.git', 'https://github.com/acme/web')).toBe(true)
    expect(sameRepository('https://x-access-token:abc@github.com/Acme/web.git', 'https://github.com/acme/web')).toBe(true)
    expect(sameRepository('https://github.com/acme/other', 'https://github.com/acme/web')).toBe(false)
  })
})
