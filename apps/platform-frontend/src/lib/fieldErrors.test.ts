import { fieldErrorsOf } from './fieldErrors'

describe('fieldErrorsOf', () => {
  it('turns the server validation details into a plain hint per field', () => {
    const errors = fieldErrorsOf({
      error: 'Validation error',
      details: [
        { field: 'email', message: '"email" must be a valid email' },
        { field: 'role', message: '"role" must be one of [admin, member]' },
      ],
    })
    expect(errors?.fields).toEqual({ email: 'Enter a full email address, like name@company.com.', role: 'role must be one of [admin, member]' })
    expect(errors?.message).toContain('Enter a full email address')
  })

  it('is null for any other error', () => {
    expect(fieldErrorsOf({ error: 'Invalid email or password' })).toBeNull()
  })
})
