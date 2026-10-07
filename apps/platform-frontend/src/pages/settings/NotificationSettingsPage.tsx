import { Button } from '@/components/button'
import { Heading, Subheading } from '@/components/heading'
import { PageMeta } from '@/components/page-meta'
import { Text } from '@/components/text'
import { useAuth } from '@/context/auth-context'
import {
  getNotificationChannels,
  linkSlack,
  sendTestEmail,
  unlinkSlack,
  type NotificationChannels,
} from '@/service/api/me-api'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

/** Where you hear about things outside the app: Slack DMs once linked; email when the workspace has it. In the app, Home shows what needs you. */
export function NotificationSettingsPage() {
  const { user } = useAuth()
  const [channels, setChannels] = useState<NotificationChannels | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    getNotificationChannels()
      .then(setChannels)
      .catch((error: unknown) => toast.error(error instanceof Error ? error.message : 'Failed to load'))
  }, [])

  async function testEmail() {
    setBusy(true)
    try {
      toast.success(`Test email sent to ${await sendTestEmail()}. If it doesn't arrive, check spam and the sending setup.`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to send the test email')
    } finally {
      setBusy(false)
    }
  }

  async function toggleSlack(link: boolean) {
    setBusy(true)
    try {
      await (link ? linkSlack() : unlinkSlack())
      setChannels(await getNotificationChannels())
      toast.success(link ? 'Slack linked: you’ll get DMs for reviews, mentions and failures' : 'Slack unlinked')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to change Slack')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <PageMeta title="Notifications" />
      <div className="max-w-2xl space-y-8 p-6 lg:p-8">
        <div>
          <Heading>Notifications</Heading>
          <Text className="mt-2">
            {user?.role === 'viewer' ? (
              <>
                You can read the spaces you belong to. Overview shows what&apos;s happening in them; open any task to follow its
                conversation and documents.
              </>
            ) : (
              <>
                Home shows every task that needs you, with what&apos;s new in each. Review requests, mentions and failures on your
                tasks can also reach you in Slack.
              </>
            )}
          </Text>
        </div>
        {channels && (
          <>
            <section className="space-y-2">
              <Subheading>Slack</Subheading>
              {!channels.slackAvailable ? (
                <Text>Slack isn't connected to this workspace. An admin can connect it under Settings → Connections.</Text>
              ) : channels.slackLinked ? (
                <div className="flex items-center gap-3">
                  <Text>Linked. You get DMs for review requests, mentions, new tasks you own and failed runs.</Text>
                  <Button outline disabled={busy} onClick={() => void toggleSlack(false)}>
                    Unlink
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <Text>Viberglass finds your Slack account by your email, {user?.email}.</Text>
                  <Button color="brand" disabled={busy} onClick={() => void toggleSlack(true)}>
                    Link Slack
                  </Button>
                </div>
              )}
            </section>
            <section className="space-y-2">
              <Subheading>Email</Subheading>
              <Text>
                {channels.emailAvailable
                  ? `Failed setups and finished tasks are also emailed to ${user?.email}.`
                  : 'Email isn’t set up on this workspace, so nothing is emailed.'}
              </Text>
              {channels.emailAvailable && user?.role === 'admin' && (
                <Button outline disabled={busy} onClick={() => void testEmail()}>
                  Send test email
                </Button>
              )}
            </section>
          </>
        )}
      </div>
    </>
  )
}
