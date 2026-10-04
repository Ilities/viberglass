/** What a field needs, in plain words, for the fields the account forms share. */
const FIELD_HINT: Record<string, string> = {
  email: 'Enter a full email address, like name@company.com.',
  password: 'Use at least 8 characters.',
  name: 'Enter a name.',
}

interface ValidationDetail {
  field: string
  message: string
}

function isDetail(value: unknown): value is ValidationDetail {
  return typeof value === 'object' && value !== null && 'field' in value && 'message' in value && typeof value.field === 'string' && typeof value.message === 'string'
}

/** A request the server refused field by field, with what each field needs. */
export class FieldErrors extends Error {
  constructor(readonly fields: Record<string, string>) {
    super(Object.values(fields).join(' '))
    this.name = 'FieldErrors'
  }
}

/** The fields a validation error response names, each with a plain hint; null when it isn't one. */
export function fieldErrorsOf(body: unknown): FieldErrors | null {
  if (typeof body !== 'object' || body === null || !('details' in body) || !Array.isArray(body.details)) return null
  const details = body.details.filter(isDetail)
  if (details.length === 0) return null
  return new FieldErrors(Object.fromEntries(details.map((detail) => [detail.field, FIELD_HINT[detail.field] ?? detail.message.replace(/"/g, '')])))
}
