import { isValidCronExpression } from '@viberglass/types'

export type CronFrequency = 'hourly' | 'daily' | 'weekdays' | 'weekly' | 'monthly' | 'custom'

export type CronBuilder = {
  frequency: CronFrequency
  minute: number
  hour: number
  weekday: number
  monthDay: number
  custom: string
}

export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

export const defaultCronBuilder: CronBuilder = {
  frequency: 'daily',
  minute: 0,
  hour: 9,
  weekday: 1,
  monthDay: 1,
  custom: '',
}

export function buildCron(b: CronBuilder): string {
  switch (b.frequency) {
    case 'hourly':
      return `0 ${b.minute} * * * *`
    case 'daily':
      return `0 ${b.minute} ${b.hour} * * *`
    case 'weekdays':
      return `0 ${b.minute} ${b.hour} * * 1-5`
    case 'weekly':
      return `0 ${b.minute} ${b.hour} * * ${b.weekday}`
    case 'monthly':
      return `0 ${b.minute} ${b.hour} ${b.monthDay} * *`
    case 'custom':
      return b.custom.trim()
  }
}

const NUM = '(\\d+)'

/** Recovers the builder an expression came from, falling back to custom for anything else. */
export function parseCronBuilder(expression: string): CronBuilder {
  const expr = expression.trim()
  if (!expr) return defaultCronBuilder
  const base = { ...defaultCronBuilder, custom: expr }
  if (!isValidCronExpression(expr)) return { ...base, frequency: 'custom' }

  const match = (pattern: string) => expr.match(new RegExp(`^0 ${pattern}$`))
  const toInts = (m: RegExpMatchArray) => m.slice(1).map((v) => parseInt(v, 10))

  const hourly = match(`${NUM} \\* \\* \\* \\*`)
  if (hourly) {
    const [minute] = toInts(hourly)
    return { ...base, frequency: 'hourly', minute }
  }
  const daily = match(`${NUM} ${NUM} \\* \\* \\*`)
  if (daily) {
    const [minute, hour] = toInts(daily)
    return { ...base, frequency: 'daily', minute, hour }
  }
  const weekdays = match(`${NUM} ${NUM} \\* \\* 1-5`)
  if (weekdays) {
    const [minute, hour] = toInts(weekdays)
    return { ...base, frequency: 'weekdays', minute, hour }
  }
  const weekly = match(`${NUM} ${NUM} \\* \\* ${NUM}`)
  if (weekly) {
    const [minute, hour, weekday] = toInts(weekly)
    return { ...base, frequency: 'weekly', minute, hour, weekday }
  }
  const monthly = match(`${NUM} ${NUM} ${NUM} \\* \\*`)
  if (monthly) {
    const [minute, hour, monthDay] = toInts(monthly)
    if (monthDay <= 28) return { ...base, frequency: 'monthly', minute, hour, monthDay }
  }
  return { ...base, frequency: 'custom' }
}

type SimpleField = { kind: 'any' } | { kind: 'value'; value: number } | { kind: 'step'; step: number }
type CronField = SimpleField | { kind: 'range'; from: number; to: number } | { kind: 'list'; values: number[] }

function isSimple(field: CronField): field is SimpleField {
  return field.kind !== 'range' && field.kind !== 'list'
}

function parseField(field: string): CronField | null {
  if (field === '*') return { kind: 'any' }
  const step = field.match(/^\*\/(\d+)$/)
  if (step) {
    const value = parseInt(step[1], 10)
    return value > 0 ? { kind: 'step', step: value } : null
  }
  const range = field.match(/^(\d+)-(\d+)$/)
  if (range) return { kind: 'range', from: parseInt(range[1], 10), to: parseInt(range[2], 10) }
  if (/^\d+(,\d+)+$/.test(field)) return { kind: 'list', values: field.split(',').map((v) => parseInt(v, 10)) }
  return /^\d+$/.test(field) ? { kind: 'value', value: parseInt(field, 10) } : null
}

function joinWords(words: string[]): string {
  return words.length < 2 ? words.join('') : `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`
}

function describeWeekdays(weekday: CronField): string | null {
  if (weekday.kind === 'value') return `on ${WEEKDAYS[weekday.value]}s`
  if (weekday.kind === 'step') return `on every ${ordinal(weekday.step)} day of the week from Sunday`
  if (weekday.kind === 'range') {
    if (weekday.from === 1 && weekday.to === 5) return 'on weekdays'
    return `from ${WEEKDAYS[weekday.from]} to ${WEEKDAYS[weekday.to]}`
  }
  if (weekday.kind === 'list') return `on ${joinWords(weekday.values.map((v) => `${WEEKDAYS[v]}s`))}`
  return null
}

const pad = (n: number) => String(n).padStart(2, '0')

export function formatTime(hour: number, minute: number): string {
  return `${pad(hour)}:${pad(minute)}`
}

function plural(n: number, unit: string): string {
  return n === 1 ? unit : `${n} ${unit}s`
}

function ordinal(n: number): string {
  const tens = n % 100
  if (tens >= 11 && tens <= 13) return `${n}th`
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`
}

function describeTime(minute: SimpleField, hour: SimpleField): string {
  if (hour.kind === 'value') {
    if (minute.kind === 'value') return `at ${formatTime(hour.value, minute.value)}`
    const during = `between ${formatTime(hour.value, 0)} and ${formatTime(hour.value, 59)}`
    return minute.kind === 'any' ? `every minute ${during}` : `every ${plural(minute.step, 'minute')} ${during}`
  }
  const everyHours = hour.kind === 'step' ? `every ${plural(hour.step, 'hour')}` : 'every hour'
  if (minute.kind === 'value') {
    return minute.value === 0 ? `${everyHours}, on the hour` : `${everyHours} at ${minute.value} minutes past`
  }
  const everyMinutes = minute.kind === 'any' ? 'every minute' : `every ${plural(minute.step, 'minute')}`
  return hour.kind === 'any' ? everyMinutes : `${everyMinutes}, ${everyHours}`
}

function describeDays(monthDay: SimpleField, month: SimpleField, weekday: CronField): string[] {
  const parts: string[] = []
  const weekdays = describeWeekdays(weekday)
  if (weekdays) parts.push(weekdays)
  if (monthDay.kind === 'value') parts.push(`on the ${ordinal(monthDay.value)} of the month`)
  if (monthDay.kind === 'step') parts.push(`every ${plural(monthDay.step, 'day')} from the 1st`)
  if (month.kind === 'value') parts.push(`in ${MONTHS[month.value - 1]}`)
  if (month.kind === 'step') parts.push(`every ${plural(month.step, 'month')} from January`)
  return parts
}

/** Plain-English reading of an expression, or null when it isn't one the scheduler accepts. */
export function describeCron(expression: string): string | null {
  const expr = expression.trim()
  if (!isValidCronExpression(expr)) return null
  const fields = expr
    .split(/\s+/)
    .map(parseField)
    .filter((f): f is CronField => f !== null)
  if (fields.length !== 6) return null
  const [second, minute, hour, monthDay, month, weekday] = fields
  if (!isSimple(second) || !isSimple(minute) || !isSimple(hour) || !isSimple(monthDay) || !isSimple(month)) {
    return 'Custom schedule'
  }

  const time = describeTime(minute, hour)
  const days = describeDays(monthDay, month, weekday)
  const dailyTime = hour.kind === 'value' && minute.kind === 'value'
  const sentence = [days.length === 0 && dailyTime ? 'Every day' : null, time, ...days].filter(Boolean).join(' ')
  const seconds = second.kind === 'value' && second.value !== 0 ? `, ${second.value} seconds past the minute` : ''
  return sentence.charAt(0).toUpperCase() + sentence.slice(1) + seconds
}
