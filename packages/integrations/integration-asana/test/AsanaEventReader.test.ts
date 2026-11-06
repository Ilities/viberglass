import { AsanaEventReader } from '../src/backend/webhook/AsanaEventReader'

describe('AsanaEventReader', () => {
  it('expands tasks into issue events and comments into comment actions', async () => {
    const fetchImpl = jest.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { gid: 'task-1', name: 'Ship it', notes: 'details', permalink_url: 'https://app.asana.com/0/1/2', completed: false, memberships: [{ project: { gid: 'project-1' } }], tags: [{ name: 'Bug' }] } })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { gid: 'story-1', resource_subtype: 'comment_added', text: '@Viberglass please review', created_by: { gid: 'user-2', name: 'Alex' }, target: { gid: 'task-1' } } })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { gid: 'task-1', name: 'Ship it', memberships: [{ project: { gid: 'project-1' } }] } }))) as typeof fetch
    const reader = new AsanaEventReader({ type: 'token', token: 'pat-test' }, fetchImpl)
    const actions = await reader.readBatch([
      { action: 'added', resource: { gid: 'task-1', resource_type: 'task' }, parent: { gid: 'project-1', resource_type: 'project' } },
      { action: 'added', resource: { gid: 'story-1', resource_type: 'story' } },
    ], { botUsername: 'Viberglass', credentials: { type: 'token', token: 'pat-test' } })
    expect(actions).toEqual([
      expect.objectContaining({ kind: 'issue', issue: expect.objectContaining({ key: 'task-1', title: 'Ship it', labels: ['bug'], metadata: expect.objectContaining({ projectId: 'project-1' }) }) }),
      expect.objectContaining({ kind: 'comment', comment: expect.objectContaining({ issueKey: 'task-1', body: 'please review', mentionsBot: true }) }),
    ])
  })
})
