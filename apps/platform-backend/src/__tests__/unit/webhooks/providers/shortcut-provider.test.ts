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

  it('normalizes legacy Shortcut event_type + story payloads into canonical data', () => {
    const event = provider.parseEvent(
      {
        event_type: 'story_create',
        member_id: 'member-legacy',
        story: {
          id: 202,
          name: 'Legacy story payload',
          story_type: 'bug',
          project_id: 22,
          project: {
            id: 22,
            name: 'Core Product',
          },
          created_at: '2026-02-10T00:02:00.000Z',
          updated_at: '2026-02-10T00:02:00.000Z',
        },
      },
      {
        'x-shortcut-delivery': 'shortcut-delivery-legacy-1',
      },
    );

    expect(event.eventType).toBe('story_created');
    expect(event.metadata).toEqual(
      expect.objectContaining({
        issueKey: '202',
        projectId: '22',
        repositoryId: 'Core Product',
        sender: 'member-legacy',
      }),
    );
    expect(event.payload).toEqual(
      expect.objectContaining({
        object_type: 'story',
        action: 'create',
        data: expect.objectContaining({
          id: 202,
          name: 'Legacy story payload',
        }),
      }),
    );
  });

  it('parses wrapped Shortcut payload JSON from payload field', () => {
    const event = provider.parseEvent(
      {
        payload: JSON.stringify({
          object_type: 'comment',
          action: 'create',
          member_id: 'member-wrapped',
          data: {
            id: 9555,
            story_id: 202,
            text: '@viberator fix this please',
            created_at: '2026-02-10T00:03:00.000Z',
            updated_at: '2026-02-10T00:03:00.000Z',
          },
        }),
      },
      {
        'x-shortcut-delivery': 'shortcut-delivery-wrapped-1',
      },
    );

    expect(event.eventType).toBe('comment_created');
    expect(event.metadata).toEqual(
      expect.objectContaining({
        issueKey: '202',
        commentId: '9555',
        sender: 'member-wrapped',
      }),
    );
    expect(event.payload).toEqual(
      expect.objectContaining({
        object_type: 'comment',
        action: 'create',
        data: expect.objectContaining({
          id: 9555,
          story_id: 202,
        }),
      }),
    );
  });

  it('parses Shortcut v1 actions payloads where entity fields are on actions[0]', () => {
    const event = provider.parseEvent(
      {
        id: '6992399a-ddcc-429d-9d47-42bb0420da92',
        changed_at: '2026-02-15T21:24:42.807Z',
        version: 'v1',
        primary_id: 34,
        actor_name: 'Jussi Hallila',
        member_id: '697f111a-ae23-4f2b-8dbe-b15e034ea83a',
        actions: [
          {
            app_url: 'https://app.shortcut.com/ilitiesdev-bv/story/34',
            description: '',
            entity_type: 'story',
            story_type: 'feature',
            name: 'test ticket 1',
            requested_by_id: '697f111a-ae23-4f2b-8dbe-b15e034ea83a',
            group_id: '697f111a-a8aa-4328-982a-3bcef1e374c5',
            workflow_state_id: 500000007,
            follower_ids: ['697f111a-ae23-4f2b-8dbe-b15e034ea83a'],
            id: 34,
            position: 22148532224,
            action: 'create',
          },
        ],
        references: [
          {
            id: 500000007,
            entity_type: 'workflow-state',
            name: 'To Do',
            type: 'unstarted',
          },
          {
            id: '697f111a-a8aa-4328-982a-3bcef1e374c5',
            entity_type: 'group',
            name: "Jussi Hallila's Team",
          },
        ],
      },
      {
        'x-shortcut-delivery': 'shortcut-delivery-v1-actions',
      },
    );

    expect(event.eventType).toBe('story_created');
    expect(event.metadata).toEqual(
      expect.objectContaining({
        issueKey: '34',
        action: 'create',
        sender: '697f111a-ae23-4f2b-8dbe-b15e034ea83a',
      }),
    );
    expect(event.payload).toEqual(
      expect.objectContaining({
        object_type: 'story',
        action: 'create',
        data: expect.objectContaining({
          id: 34,
          name: 'test ticket 1',
          story_type: 'feature',
        }),
      }),
    );
  });

  it('normalizes Shortcut v1 update changes into story data fields', () => {
    const event = provider.parseEvent(
      {
        id: 'd5fdd764-c1e0-471d-99b0-53f1576bc9f7',
        changed_at: '2026-02-16T08:30:00.000Z',
        version: 'v1',
        primary_id: 34,
        member_id: '697f111a-ae23-4f2b-8dbe-b15e034ea83a',
        actions: [
          {
            entity_type: 'story',
            action: 'update',
            id: 34,
            name: 'old title',
            description: '',
            story_type: 'feature',
            app_url: 'https://app.shortcut.com/ilitiesdev-bv/story/34',
            changes: {
              name: { old: 'old title', new: 'updated title' },
              description: { old: '', new: 'Updated body from Shortcut' },
              story_type: { old: 'feature', new: 'bug' },
              app_url: {
                old: 'https://app.shortcut.com/ilitiesdev-bv/story/34',
                new: 'https://app.shortcut.com/ilitiesdev-bv/story/34',
              },
            },
          },
        ],
        changed_fields: ['name', 'description', 'story_type'],
      },
      {
        'x-shortcut-delivery': 'shortcut-delivery-v1-update',
      },
    );

    expect(event.eventType).toBe('story_updated');
    expect(event.metadata).toEqual(
      expect.objectContaining({
        issueKey: '34',
        action: 'update',
      }),
    );
    expect(event.payload).toEqual(
      expect.objectContaining({
        object_type: 'story',
        action: 'update',
        data: expect.objectContaining({
          id: 34,
          name: 'updated title',
          description: 'Updated body from Shortcut',
          story_type: 'bug',
          app_url: 'https://app.shortcut.com/ilitiesdev-bv/story/34',
        }),
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
