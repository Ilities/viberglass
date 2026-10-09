import { jiraBrowseUrl, jiraLabels, jiraSiteUrl, jiraText } from '../src/backend/jiraPayload'

describe('Jira payloads', () => {
  it('reads rich text as paragraphs, lists and code', () => {
    const description = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Login fails ' }, { type: 'mention', attrs: { text: '@Maria' } }] },
        { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'after reset' }] }] }] },
        { type: 'codeBlock', content: [{ type: 'text', text: '500 Internal' }] },
      ],
    }
    expect(jiraText(description)).toBe('Login fails @Maria\n\n- after reset\n\n```\n500 Internal\n```')
    expect(jiraText('  *wiki* text ')).toBe('*wiki* text')
    expect(jiraText(null)).toBe('')
  })

  it("finds the site and the issue's page from its API link", () => {
    const self = 'https://acme.atlassian.net/rest/api/2/issue/10001'
    expect(jiraSiteUrl(self)).toBe('https://acme.atlassian.net')
    expect(jiraBrowseUrl(self, 'OPS-1')).toBe('https://acme.atlassian.net/browse/OPS-1')
    expect(jiraSiteUrl('https://jira.acme.com/jira/rest/api/2/issue/1')).toBe('https://jira.acme.com/jira')
    expect(jiraSiteUrl(undefined)).toBeNull()
  })

  it("reads Jira's labels, lower-cased", () => {
    expect(jiraLabels({ labels: ['Frontend', ' ui ', ''] })).toEqual(['frontend', 'ui'])
    expect(jiraLabels({})).toEqual([])
  })
})
