import { Badge } from '@/components/badge'
import { Subheading } from '@/components/heading'
import { Input } from '@/components/input'
import { Text } from '@/components/text'
import { getSlackBotStatus } from '@/service/api/integration-api'
import { CheckCircledIcon, CheckIcon, CopyIcon, DotFilledIcon } from '@radix-ui/react-icons'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

const BASE_MANIFEST = {
  _metadata: { major_version: 2, minor_version: 0 },
  display_information: {
    name: 'Viberator',
    description: 'Launch and interact with Viberator agent sessions from Slack',
    background_color: '#1a1a2e',
    long_description:
      'Viberator Slack integration allows you to launch AI agent sessions directly from Slack using the /viberator slash command. Sessions stream their progress into a Slack thread where you can reply to continue the conversation, provide input when the agent asks, and approve or reject actions.',
  },
  features: {
    bot_user: { display_name: 'Viberator', always_online: true },
    slash_commands: [
      {
        command: '/viberator',
        url: 'https://YOUR_HOST/api/webhooks/slack',
        description: 'Launch an agent session',
        usage_hint: '[message]',
        should_escape: false,
      },
    ],
  },
  oauth_config: {
    scopes: {
      bot: [
        'commands',
        'chat:write',
        'chat:write.public',
        'channels:read',
        'channels:history',
        'groups:read',
        'groups:history',
        'im:read',
        'im:history',
        'users:read',
        'files:write',
      ],
    },
  },
  settings: {
    interactivity: {
      is_enabled: true,
      request_url: 'https://YOUR_HOST/api/webhooks/slack',
    },
    event_subscriptions: {
      request_url: 'https://YOUR_HOST/api/webhooks/slack',
      bot_events: ['app_mention', 'message.channels', 'message.groups'],
    },
    org_deploy_enabled: false,
    socket_mode_enabled: false,
    token_rotation_enabled: false,
  },
}

function buildManifest(host: string): string {
  const filled = host.trim()
  const raw = JSON.stringify(BASE_MANIFEST, null, 2)
  if (!filled) return raw
  return raw.replaceAll('YOUR_HOST', filled.replace(/^https?:\/\//, ''))
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text)
    toast.success('Copied to clipboard')
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <button
      type="button"
      onClick={() => void handleCopy()}
      className="flex items-center gap-1.5 rounded px-2 py-1 text-xs text-[var(--gray-9)] hover:bg-[var(--gray-4)] hover:text-[var(--gray-12)] transition-colors"
    >
      {copied ? <CheckIcon className="h-3.5 w-3.5 text-green-500" /> : <CopyIcon className="h-3.5 w-3.5" />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  )
}

export function SlackInstallSection() {
  const [host, setHost] = useState('')
  const [botConfigured, setBotConfigured] = useState<boolean | null>(null)

  useEffect(() => {
    getSlackBotStatus()
      .then(({ configured }) => setBotConfigured(configured))
      .catch(() => setBotConfigured(false))
  }, [])

  const manifest = buildManifest(host)
  const envBlock = `SLACK_BOT_TOKEN=xoxb-your-bot-token\nSLACK_SIGNING_SECRET=your-signing-secret`

  return (
    <section className="app-frame rounded-lg p-6 space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Subheading>Install the Viberator Slack app</Subheading>
          <Text className="mt-1.5 text-[var(--gray-9)]">
            Slack is integrated as a workspace-level bot. Use <code>/viberator</code> to create
            tickets and run AI agent jobs directly from Slack — research, planning, and execution
            phases are all driven by keyword commands in the thread. A workspace admin sets the bot
            up once; there is nothing to configure per project here.
          </Text>
        </div>
        {botConfigured !== null && (
          botConfigured ? (
            <Badge color="green" className="shrink-0">
              <CheckCircledIcon className="mr-1 inline-block h-3 w-3" />
              Bot active
            </Badge>
          ) : (
            <Badge color="zinc" className="shrink-0">
              <DotFilledIcon className="mr-1 inline-block h-3 w-3" />
              Not configured
            </Badge>
          )
        )}
      </div>

      {/* Step 1 */}
      <div className="space-y-3">
        <Subheading level={3}>1. Create the Slack app from the manifest</Subheading>
        <Text className="text-[var(--gray-9)]">
          Enter your backend's public HTTPS hostname below, then copy the manifest and paste it at{' '}
          <a
            href="https://api.slack.com/apps"
            target="_blank"
            rel="noreferrer"
            className="text-[var(--accent-11)] underline"
          >
            api.slack.com/apps
          </a>{' '}
          → <strong>Create New App → From a manifest</strong>. Click <strong>Create</strong> and
          install the app to your workspace.
        </Text>

        <div className="flex items-center gap-2">
          <label htmlFor="slack-host" className="shrink-0 text-sm font-medium text-[var(--gray-11)]">
            Backend host
          </label>
          <Input
            id="slack-host"
            type="text"
            placeholder="api.example.com"
            value={host}
            onChange={(e) => setHost(e.target.value)}
            className="max-w-sm"
          />
        </div>

        <div className="rounded-md bg-[var(--gray-3)] overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2 border-b border-[var(--gray-5)]">
            <span className="text-xs font-medium text-[var(--gray-10)]">slack-app-manifest.json</span>
            <CopyButton text={manifest} />
          </div>
          <pre className="p-4 text-xs overflow-x-auto max-h-72">
            <code>{manifest}</code>
          </pre>
        </div>
      </div>

      {/* Step 2 */}
      <div className="space-y-3">
        <Subheading level={3}>2. Collect credentials</Subheading>
        <Text className="text-[var(--gray-9)]">
          After installing the app, copy two values from the Slack app settings page:
        </Text>
        <ul className="list-disc list-inside space-y-1 text-sm text-[var(--gray-11)]">
          <li>
            <strong>Bot User OAuth Token</strong> (<code>xoxb-…</code>) — found under{' '}
            <strong>OAuth &amp; Permissions</strong>
          </li>
          <li>
            <strong>Signing Secret</strong> — found under <strong>Basic Information</strong>
          </li>
        </ul>
      </div>

      {/* Step 3 */}
      <div className="space-y-3">
        <Subheading level={3}>3. Configure the backend</Subheading>
        <Text className="text-[var(--gray-9)]">
          Add these two environment variables to the platform backend and restart it:
        </Text>
        <div className="rounded-md bg-[var(--gray-3)] overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2 border-b border-[var(--gray-5)]">
            <span className="text-xs font-medium text-[var(--gray-10)]">.env</span>
            <CopyButton text={envBlock} />
          </div>
          <pre className="p-4 text-xs overflow-x-auto">
            <code>{envBlock}</code>
          </pre>
        </div>
      </div>

      {/* Step 4 */}
      <div className="space-y-3">
        <Subheading level={3}>4. Use it from Slack</Subheading>
        <Text className="text-[var(--gray-9)]">
          Invite the bot to a channel with <code>/invite @Viberator</code>, then run{' '}
          <code>/viberator</code> to open the launch modal. Pick a project, clanker, starting phase
          (research / planning / execution), and describe the task. Clicking <strong>Launch</strong>{' '}
          creates a ticket and starts the first job — the bot posts a thread with a link to the
          ticket and streams progress there.
        </Text>
        <Text className="text-[var(--gray-9)]">
          Once a job completes, the bot posts an <strong>Approve / Reject</strong> card in the
          thread. Click <strong>Approve</strong> to advance to the next phase, or{' '}
          <strong>Reject</strong> to keep the current phase open for revision.
        </Text>
        <Text className="text-[var(--gray-9)]">
          You can also <strong>@mention the bot</strong> with a keyword as an alternative path:
        </Text>
        <ul className="list-disc list-inside space-y-1 text-sm text-[var(--gray-11)]">
          <li>
            <strong>From research:</strong> <code>plan it</code> / <code>lgtm</code> /{' '}
            <code>next</code> → advance to planning
          </li>
          <li>
            <strong>From planning:</strong> <code>execute</code> / <code>ship it</code> /{' '}
            <code>lgtm</code> / <code>next</code> → advance to execution
          </li>
          <li>
            <strong>From research (skip planning):</strong> <code>execute</code> / <code>ship it</code>{' '}
            → chains planning then execution automatically
          </li>
          <li>
            <strong>Any other text</strong> → revision job using your message as feedback
          </li>
        </ul>
        <Text className="text-[var(--gray-9)]">
          Keywords are case-insensitive and punctuation is stripped, so <code>LGTM!</code> and{' '}
          <code>lgtm.</code> both work. When execution completes the bot posts the pull request link.
          The same <strong>Approve / Reject</strong> buttons also appear if the agent requests
          approval mid-run during execution.
        </Text>
      </div>

      <Text className="text-xs text-[var(--gray-9)] border-t border-[var(--gray-5)] pt-4">
        Full reference, troubleshooting steps, and ngrok instructions for local development are in{' '}
        <code>docs/operations/slack-integration.md</code>.
      </Text>
    </section>
  )
}
