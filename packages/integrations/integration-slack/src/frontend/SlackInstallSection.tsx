import { Badge } from '@viberglass/platform-ui'
import { Subheading } from '@viberglass/platform-ui'
import { Input } from '@viberglass/platform-ui'
import { Text } from '@viberglass/platform-ui'
import { CheckCircledIcon, CheckIcon, CopyIcon, DotFilledIcon } from '@radix-ui/react-icons'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

const BASE_MANIFEST = {
  _metadata: { major_version: 2, minor_version: 0 },
  display_information: {
    name: 'Viberglass',
    description: 'Start tasks and talk to the agent from Slack',
    background_color: '#1a1a2e',
    long_description:
      'The Viberglass Slack app lets you start tasks from Slack with the /viberglass slash command. Each task has a Slack thread that follows it, where you talk to the people on the task, @mention the agent to ask it for something, and answer its questions.',
  },
  features: {
    bot_user: { display_name: 'Viberglass', always_online: true },
    slash_commands: [
      {
        command: '/viberglass',
        url: 'https://YOUR_HOST/api/webhooks/slack',
        description: 'Start a task',
        usage_hint: '[message]',
        should_escape: false,
      },
    ],
  },
  oauth_config: {
    scopes: {
      bot: [
        'commands',
        'app_mentions:read',
        'chat:write',
        'chat:write.public',
        'channels:read',
        'channels:history',
        'groups:read',
        'groups:history',
        'im:read',
        'im:history',
        'im:write',
        'users:read',
        'users:read.email',
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

export function SlackInstallSection({ getBotStatus }: { getBotStatus?: () => Promise<{ configured: boolean }> }) {
  const [host, setHost] = useState('')
  const [botConfigured, setBotConfigured] = useState<boolean | null>(null)

  useEffect(() => {
    if (!getBotStatus) return
    getBotStatus()
      .then(({ configured }) => setBotConfigured(configured))
      .catch(() => setBotConfigured(false))
  }, [getBotStatus])

  const manifest = buildManifest(host)
  const envBlock = `SLACK_BOT_TOKEN=xoxb-your-bot-token\nSLACK_SIGNING_SECRET=your-signing-secret`

  return (
    <section className="app-frame rounded-lg p-6 space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Subheading>Install the Viberglass Slack app</Subheading>
          <Text className="mt-1.5 text-[var(--gray-9)]">
            Slack is integrated as a workspace-level bot. Use <code>/viberglass</code> to create
            tasks from Slack, and talk to the agent in each task's thread. A workspace admin sets the bot
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
          Invite the bot to a channel with <code>/invite @Viberglass</code>, then run{' '}
          <code>/viberglass</code> to open the launch form. Pick a space and an agent, choose whether
          to start with a plan or go straight to the build, and describe the task. Clicking{' '}
          <strong>Ask</strong> creates the task and starts its thread in the channel; from then
          on, that thread is the task's thread.
        </Text>
        <Text className="text-[var(--gray-9)]">
          The thread follows the task: the agent's replies, the plan as a file, the pull request
          link, and what people write in Viberglass. In the thread:
        </Text>
        <ul className="list-disc list-inside space-y-1 text-sm text-[var(--gray-11)]">
          <li>
            <strong>@mention the bot</strong> to ask the agent, in your own words
          </li>
          <li>
            <strong>Build it</strong> under a finished plan asks the agent to build it
          </li>
          <li>
            When the agent asks you a question, pick an option or reply in the thread
          </li>
          <li>
            Any other message goes to the task's thread, for the people on the task
          </li>
        </ul>
        <Text className="text-[var(--gray-9)]">
          People take part as their Viberglass account, so each person links their Slack account
          under <strong>Settings → Notifications</strong> first.
        </Text>
      </div>

      <Text className="text-xs text-[var(--gray-9)] border-t border-[var(--gray-5)] pt-4">
        Full reference, troubleshooting steps, and ngrok instructions for local development are in{' '}
        <code>docs/operations/slack-integration.md</code>.
      </Text>
    </section>
  )
}
