import { spaceTabs } from './spaceTabs'

const labels = (options: Partial<Parameters<typeof spaceTabs>[0]>) =>
  spaceTabs({ slug: 'web', pathname: '/spaces/web', files: false, runner: true, canMaintain: true, ...options }).map((tab) => tab.label)

describe('spaceTabs', () => {
  it('puts the work first, then schedules, the track record, runs and settings', () => {
    expect(labels({})).toEqual(['Tasks', 'Schedules', 'Track record', 'Runs', 'Settings'])
    expect(labels({ files: true })).toEqual(['Tasks', 'Files', 'Artifacts', 'Schedules', 'Track record', 'Runs', 'Settings'])
  })

  it('gives guests and viewers the tasks and what the space is', () => {
    expect(labels({ runner: false, canMaintain: false })).toEqual(['Tasks', 'About'])
  })

  it('marks the page you are on, Tasks only on the space itself', () => {
    const current = (pathname: string) =>
      spaceTabs({ slug: 'web', pathname, files: false, runner: true, canMaintain: true }).find((tab) => tab.current)?.label

    expect(current('/spaces/web')).toBe('Tasks')
    expect(current('/spaces/web/settings/members')).toBe('Settings')
    expect(current('/spaces/web/runs')).toBe('Runs')
    expect(current('/spaces/web/runs-elsewhere')).toBeUndefined()
  })
})
