import { Badge } from '@/components/badge'
import { Button } from '@/components/button'
import { Heading, Subheading } from '@/components/heading'
import { Input } from '@/components/input'
import { Textarea } from '@/components/textarea'
import { Select } from '@/components/select'
import { getBugReportDetails, formatSeverity, formatAutoFixStatus, triggerAutoFix } from '@/data'
import { SparklesIcon, PlayIcon, ClockIcon } from '@heroicons/react/20/solid'
import { notFound } from 'next/navigation'

export default async function EnhancePage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const params = await searchParams
  const bugReportId = params.id as string

  if (!bugReportId) {
    return (
      <>
        <Heading>Enhance & Auto-Fix</Heading>
        <div className="mt-8 text-center">
          <p className="text-zinc-500">Select a bug report to enhance and auto-fix.</p>
          <div className="mt-4">
            <Button href="/bug-reports" color="blue">
              Browse Bug Reports
            </Button>
          </div>
        </div>
      </>
    )
  }

  const bugReport = await getBugReportDetails(bugReportId)

  if (!bugReport) {
    notFound()
  }

  return (
    <>
      <div className="flex items-center gap-4">
        <Heading>Enhance & Auto-Fix</Heading>
        <Badge className={formatSeverity(bugReport.severity).color}>
          {formatSeverity(bugReport.severity).label}
        </Badge>
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-2">
        <div>
          <Subheading>Original Bug Report</Subheading>
          <div className="mt-4 rounded-lg border border-zinc-200 bg-white p-6">
            <h3 className="font-semibold text-zinc-900">{bugReport.title}</h3>
            <p className="mt-2 text-zinc-700">{bugReport.description}</p>
            <div className="mt-4 flex items-center gap-4 text-sm text-zinc-500">
              <span>Category: {bugReport.category}</span>
              <span>Reported: {new Date(bugReport.timestamp).toLocaleString()}</span>
            </div>
          </div>

          <Subheading className="mt-8">Technical Context</Subheading>
          <div className="mt-4 space-y-4">
            <div className="rounded-lg border border-zinc-200 bg-white p-4">
              <div className="text-sm font-medium text-zinc-900">Browser & Environment</div>
              <div className="mt-2 text-sm text-zinc-600">
                {bugReport.metadata.browser.name} {bugReport.metadata.browser.version} on {bugReport.metadata.os.name} {bugReport.metadata.os.version}
              </div>
              <div className="mt-1 text-sm text-zinc-600">
                Screen: {bugReport.metadata.screen.width}×{bugReport.metadata.screen.height} | Viewport: {bugReport.metadata.screen.viewportWidth}×{bugReport.metadata.screen.viewportHeight}
              </div>
            </div>

            <div className="rounded-lg border border-zinc-200 bg-white p-4">
              <div className="text-sm font-medium text-zinc-900">Page Context</div>
              <div className="mt-2 text-sm text-zinc-600 break-all">
                URL: {bugReport.metadata.pageUrl}
              </div>
              {bugReport.metadata.referrer && (
                <div className="mt-1 text-sm text-zinc-600 break-all">
                  Referrer: {bugReport.metadata.referrer}
                </div>
              )}
            </div>

            {bugReport.metadata.errors.length > 0 && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-4">
                <div className="text-sm font-medium text-red-900">JavaScript Errors</div>
                <div className="mt-2 space-y-2">
                  {bugReport.metadata.errors.slice(0, 3).map((error, index) => (
                    <div key={index} className="text-sm text-red-800">
                      {error.message}
                    </div>
                  ))}
                  {bugReport.metadata.errors.length > 3 && (
                    <div className="text-sm text-red-600">
                      +{bugReport.metadata.errors.length - 3} more errors
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        <div>
          <Subheading>Enhance Bug Report</Subheading>
          <form className="mt-4 space-y-6">
            <div>
              <label className="block text-sm font-medium text-zinc-900">
                Additional Context
              </label>
              <Textarea
                rows={4}
                placeholder="Add any additional context, steps to reproduce, or observations..."
                className="mt-2"
                name="additionalContext"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-900">
                Reproduction Steps
              </label>
              <Textarea
                rows={3}
                placeholder="Describe the steps to reproduce this issue..."
                className="mt-2"
                name="reproductionSteps"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-900">
                Expected Behavior
              </label>
              <Input
                type="text"
                placeholder="What should happen instead?"
                className="mt-2"
                name="expectedBehavior"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-900">
                Priority Override
              </label>
              <Select name="priorityOverride" className="mt-2">
                <option value="">Use original priority</option>
                <option value="critical">Critical</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </Select>
            </div>

            <div className="flex gap-4">
              <Button type="submit" color="blue" className="flex-1">
                <SparklesIcon className="h-5 w-5 mr-2" />
                Enhance & Send to AI
              </Button>
              {bugReport.ticketId && (
                <Button type="button" color="green" className="flex-1">
                  <PlayIcon className="h-5 w-5 mr-2" />
                  Trigger Auto-Fix Now
                </Button>
              )}
            </div>
          </form>

          {bugReport.autoFixStatus && (
            <div className="mt-8">
              <Subheading>Auto-Fix Status</Subheading>
              <div className="mt-4 rounded-lg border border-zinc-200 bg-white p-4">
                <div className="flex items-center gap-3">
                  <ClockIcon className="h-5 w-5 text-zinc-400" />
                  <div>
                    <div className="font-medium text-zinc-900">
                      <Badge className={formatAutoFixStatus(bugReport.autoFixStatus).color}>
                        {formatAutoFixStatus(bugReport.autoFixStatus).label}
                      </Badge>
                    </div>
                    <div className="text-sm text-zinc-600">
                      {bugReport.autoFixStatus === 'completed' && bugReport.pullRequestUrl && (
                        <a href={bugReport.pullRequestUrl} className="text-blue-600 hover:underline">
                          View Pull Request
                        </a>
                      )}
                      {bugReport.autoFixStatus === 'in_progress' && 'AI agent is working on this issue...'}
                      {bugReport.autoFixStatus === 'failed' && 'Auto-fix attempt failed. Manual intervention may be required.'}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  )
}