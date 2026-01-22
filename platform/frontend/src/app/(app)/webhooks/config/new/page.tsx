'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Heading, Subheading } from '@/components/heading'
import { Button } from '@/components/button'
import { Link } from '@/components/link'
import { WebhookConfigForm, SetupInstructions } from '@/components/webhook-config-form'
import {
  createWebhookConfig,
  getWebhookConfigs,
  type WebhookConfig,
  type WebhookProvider,
} from '@/service/api/webhook-api'

export default function NewWebhookConfigPage() {
  const router = useRouter()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [createdConfig, setCreatedConfig] = useState<{
    provider: WebhookProvider
    providerProjectId: string
    webhookSecret: string
    allowedEvents: string[]
  } | null>(null)

  async function handleSave(config: WebhookConfig) {
    setIsSubmitting(true)
    try {
      // Extract the webhook secret before sending to API
      const webhookSecret = (config as any).webhookSecret || ''

      const created = await createWebhookConfig({
        provider: config.provider,
        providerProjectId: config.providerProjectId,
        projectId: config.projectId,
        secretLocation: config.secretLocation,
        webhookSecret: webhookSecret || undefined,
        allowedEvents: config.allowedEvents,
        autoExecute: config.autoExecute,
        botUsername: config.botUsername,
        labelMappings: config.labelMappings,
        active: config.active,
      })

      toast.success('Configuration created', {
        description: 'Webhook configuration has been successfully created.',
        action: {
          label: 'View Configurations',
          onClick: () => router.push('/webhooks'),
        },
      })

      // Show setup instructions
      setCreatedConfig({
        provider: created.provider,
        providerProjectId: created.providerProjectId || '',
        webhookSecret,
        allowedEvents: created.allowedEvents,
      })
    } catch (error) {
      console.error('Failed to create webhook config:', error)
      toast.error('Failed to create configuration', {
        description: error instanceof Error ? error.message : 'Unknown error',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="space-y-8">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
        <Link href="/webhooks" className="hover:text-zinc-900 dark:hover:text-white">
          Webhooks
        </Link>
        <span>/</span>
        <span className="text-zinc-900 dark:text-white">New Configuration</span>
      </div>

      {/* Header */}
      <div>
        <Heading>New Webhook Configuration</Heading>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Configure a new webhook provider to receive events from external platforms.
        </p>
      </div>

      {/* Form */}
      <div className="rounded-xl border border-zinc-200 bg-white p-8 dark:border-zinc-700 dark:bg-zinc-900">
        {createdConfig ? (
          <div>
            <Subheading>Configuration Created!</Subheading>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              Your webhook configuration has been created successfully. Follow the instructions below to
              complete the setup on your provider platform.
            </p>

            <SetupInstructions
              provider={createdConfig.provider}
              providerProjectId={createdConfig.providerProjectId}
              webhookSecret={createdConfig.webhookSecret}
              allowedEvents={createdConfig.allowedEvents}
            />

            <div className="mt-8 flex justify-end gap-4">
              <Button
                color="brand"
                onClick={() => router.push('/webhooks')}
              >
                Done
              </Button>
            </div>
          </div>
        ) : (
          <WebhookConfigForm
            onSave={handleSave}
            onCancel={() => router.push('/webhooks')}
            isSubmitting={isSubmitting}
          />
        )}
      </div>

      {/* Help text */}
      <div className="rounded-lg border border-blue-200 bg-blue-50 p-6 dark:border-blue-500/30 dark:bg-blue-500/10">
        <h3 className="text-sm font-semibold text-blue-900 dark:text-blue-200">
          Need help configuring webhooks?
        </h3>
        <ul className="mt-3 space-y-2 text-sm text-blue-800 dark:text-blue-300">
          <li>
            <strong>GitHub:</strong> Go to repository Settings &gt; Webhooks &gt; Add webhook
          </li>
          <li>
            <strong>Jira:</strong> Go to System &gt; Webhooks &gt; Create webhook
          </li>
        </ul>
        <p className="mt-3 text-xs text-blue-700 dark:text-blue-400">
          The webhook secret is used to verify that incoming requests are genuinely from your
          provider. Keep it secure!
        </p>
      </div>
    </div>
  )
}
