import { buildCron, defaultCronBuilder, describeCron, parseCronBuilder } from './cronSchedule'

describe('describeCron', () => {
  it.each([
    ['0 0 9 * * *', 'Every day at 09:00'],
    ['0 30 9 * * 1', 'At 09:30 on Mondays'],
    ['0 0 6 1 * *', 'At 06:00 on the 1st of the month'],
    ['0 15 * * * *', 'Every hour at 15 minutes past'],
    ['0 0 */2 * * *', 'Every 2 hours, on the hour'],
    ['0 */5 * * * *', 'Every 5 minutes'],
    ['0 * * * * *', 'Every minute'],
    ['0 */10 14 * * *', 'Every 10 minutes between 14:00 and 14:59'],
    ['0 0 12 22 3 *', 'At 12:00 on the 22nd of the month in March'],
    ['0 0 0 */3 * *', 'At 00:00 every 3 days from the 1st'],
    ['30 0 9 * * *', 'Every day at 09:00, 30 seconds past the minute'],
  ])('reads %s as "%s"', (expression, expected) => {
    expect(describeCron(expression)).toBe(expected)
  })

  it('returns null for expressions the scheduler rejects', () => {
    expect(describeCron('* * * * *')).toBeNull()
    expect(describeCron('*/5 * * * * *')).toBeNull()
    expect(describeCron('0 0 9 * * 1-5')).toBeNull()
    expect(describeCron('0 */0 * * * *')).toBeNull()
    expect(describeCron('')).toBeNull()
  })
})

describe('cron builder', () => {
  it('round-trips every preset frequency', () => {
    const builders = [
      { ...defaultCronBuilder, frequency: 'hourly' as const, minute: 20 },
      { ...defaultCronBuilder, frequency: 'daily' as const, hour: 7, minute: 45 },
      { ...defaultCronBuilder, frequency: 'weekly' as const, weekday: 5, hour: 17, minute: 0 },
      { ...defaultCronBuilder, frequency: 'monthly' as const, monthDay: 15, hour: 3, minute: 10 },
    ]
    for (const b of builders) {
      const expression = buildCron(b)
      expect(parseCronBuilder(expression)).toEqual({ ...b, custom: expression })
    }
  })

  it('falls back to custom for expressions no preset produces', () => {
    expect(parseCronBuilder('0 */5 * * * *')).toMatchObject({ frequency: 'custom', custom: '0 */5 * * * *' })
    expect(parseCronBuilder('0 0 9 30 * *')).toMatchObject({ frequency: 'custom' })
    expect(parseCronBuilder('not cron')).toMatchObject({ frequency: 'custom', custom: 'not cron' })
  })

  it('starts empty expressions on the default daily preset', () => {
    expect(parseCronBuilder('')).toEqual(defaultCronBuilder)
  })

  it('uses the custom text as-is for custom schedules', () => {
    expect(buildCron({ ...defaultCronBuilder, frequency: 'custom', custom: '  0 0 1 * * 0 ' })).toBe('0 0 1 * * 0')
  })
})
