import { initialsOf } from './initials'

describe('initialsOf', () => {
  it('takes up to two initials from the words of a name, skipping punctuation', () => {
    expect(initialsOf('Maria Product')).toBe('MP')
    expect(initialsOf('deepseek — opencode — GLM review')).toBe('DO')
    expect(initialsOf('first admin')).toBe('FA')
    expect(initialsOf('')).toBe('')
  })
})
