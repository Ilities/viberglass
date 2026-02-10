import crypto from 'crypto';
import axios from 'axios';
import {
  ShortcutWebhookProvider,
  createShortcutWebhookProviderDependencies,
} from '../../../../webhooks/providers/ShortcutWebhookProvider';

jest.mock('axios');

describe('ShortcutWebhookProvider', () => {
  let provider: ShortcutWebhookProvider;

  beforeEach(() => {
    jest.clearAllMocks();
    provider = new ShortcutWebhookProvider({
      type: 'shortcut',
      secretLocation: 'database',
      algorithm: 'sha256',
      allowedEvents: ['story_created', 'comment_created'],
      webhookSecret: 'secret',
      apiToken: 'token',
      providerProjectId: '22',
    }, createShortcutWebhookProviderDependencies());
  });

  it('parses story_created events with Shortcut project metadata', () => {
    const event = provider.parseEvent(
      {
        object_type: 'story',
        action: 'create',
        member_id: 'member-1',
        data: {
          id: 101,
          name: 'Broken onboarding flow',
          story_type: 'bug',
          project_id: 22,
          project: {
            id: 22,
            name: 'Core Product',
          },
          created_at: '2026-02-10T00:00:00.000Z',
          updated_at: '2026-02-10T00:00:00.000Z',
        },
      },
      {
        'x-shortcut-delivery': 'shortcut-delivery-1',
      },
    );

    expect(event.eventType).toBe('story_created');
    expect(event.deduplicationId).toBe('shortcut-delivery-1');
    expect(event.metadata).toEqual(
      expect.objectContaining({
        issueKey: '101',
        projectId: '22',
        repositoryId: 'Core Product',
        action: 'create',
        sender: 'member-1',
      }),
    );
  });

  it('parses comment_created events and resolves story id as issue key', () => {
    const event = provider.parseEvent(
      {
        object_type: 'comment',
        action: 'create',
        member_id: 'member-2',
        data: {
          id: 9001,
          story_id: 101,
          text: '@viberator fix this',
          author_id: 'author-1',
          created_at: '2026-02-10T00:01:00.000Z',
          updated_at: '2026-02-10T00:01:00.000Z',
        },
      },
      {
        'x-shortcut-delivery': 'shortcut-delivery-2',
      },
    );

    expect(event.eventType).toBe('comment_created');
    expect(event.metadata).toEqual(
      expect.objectContaining({
        issueKey: '101',
        commentId: '9001',
      }),
    );
  });

  it('enforces required story and comment fields for supported events', () => {
    expect(() =>
      provider.parseEvent(
        {
          object_type: 'story',
          action: 'create',
          data: {
            id: 101,
          },
        },
        { 'x-shortcut-delivery': 'shortcut-delivery-3' },
      ),
    ).toThrow("Missing required field 'data.name'");

    expect(() =>
      provider.parseEvent(
        {
          object_type: 'comment',
          action: 'create',
          data: {
            id: 9001,
          },
        },
        { 'x-shortcut-delivery': 'shortcut-delivery-4' },
      ),
    ).toThrow("Missing required field 'data.story_id'");
  });

  it('verifies valid HMAC signatures against raw bytes', () => {
    const rawBody = Buffer.from('{"object_type":"story","action":"create"}');
    const secret = 'super-secret';
    const signature = `sha256=${crypto
      .createHmac('sha256', secret)
      .update(rawBody)
      .digest('hex')}`;

    expect(provider.verifySignature(rawBody, signature, secret)).toBe(true);
    expect(provider.verifySignature(rawBody, signature, 'wrong-secret')).toBe(false);
  });

  it('posts result comment, updates labels, and applies workflow state when configured', async () => {
    provider = new ShortcutWebhookProvider({
      type: 'shortcut',
      secretLocation: 'database',
      algorithm: 'sha256',
      allowedEvents: ['job_ended'],
      apiToken: 'token',
      providerProjectId: '22',
      labelMappings: {
        shortcut: {
          successLabel: 'autofix-submitted',
          failureLabel: 'autofix-failed',
          successWorkflowStateId: 5001,
        },
      },
    }, createShortcutWebhookProviderDependencies());

    const client = {
      post: jest.fn().mockResolvedValue({}),
      get: jest.fn().mockResolvedValue({
        data: {
          labels: [{ name: 'triage' }, { name: 'Autofix-Failed' }],
        },
      }),
      put: jest.fn().mockResolvedValue({}),
    };
    (axios.create as jest.Mock).mockReturnValue(client);

    await provider.postResult('101', {
      success: true,
      action: 'comment',
      targetId: '101',
      details: 'done',
    });

    expect(client.post).toHaveBeenCalledWith(
      '/comments',
      expect.objectContaining({ story_id: 101 }),
    );
    expect(client.put).toHaveBeenCalledWith(
      '/stories/101',
      expect.objectContaining({
        labels: expect.arrayContaining([
          expect.objectContaining({ name: 'triage' }),
          expect.objectContaining({ name: 'autofix-submitted' }),
        ]),
      }),
    );
    expect(client.put).toHaveBeenCalledWith(
      '/stories/101',
      expect.objectContaining({ workflow_state_id: 5001 }),
    );
  });
});
