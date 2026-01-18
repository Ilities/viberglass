import { Badge } from '@/components/badge'
import { Button } from '@/components/button'
import { Heading, Subheading } from '@/components/heading'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/table'
import { getBugReportDetails, formatSeverity, formatAutoFixStatus, formatTicketSystem, triggerAutoFix } from '@/data'
import { ArrowLeftIcon, SparklesIcon, EyeIcon } from '@heroicons/react/20/solid'
import Link from 'next/link'
import { notFound } from 'next/navigation'

export default async function BugReportDetailPage({
  params,
}: {
  params: Promise<{ project: string; id: string }>
}) {
  const { project, id } = await params
  const bugReport = await getBugReportDetails(id)

  if (!bugReport) {
    notFound()
  }

  const handleAutoFix = async () => {
    'use server'
    if (bugReport.ticketId && bugReport.ticketSystem) {
      await triggerAutoFix(bugReport.ticketId, bugReport.ticketSystem)
    }
  }

  return (
    <>
      <div className="flex items-center gap-4">
        <Button href={`/project/${project}/bug-reports`} plain>
          <ArrowLeftIcon className="h-5 w-5" />
          Back to Bug Reports
        </Button>
      </div>

      <div className="mt-8 flex items-start justify-between">
        <div className="flex-1">
          <Heading>{bugReport.title}</Heading>
          <div className="mt-4 flex items-center gap-4">
            <Badge className={formatSeverity(bugReport.severity).color}>
              {formatSeverity(bugReport.severity).label}
            </Badge>
            <Badge className="bg-blue-100 text-blue-800">
              {bugReport.category}
            </Badge>
            {bugReport.ticketId && (
              <Badge className="bg-purple-100 text-purple-800">
                {formatTicketSystem(bugReport.ticketSystem)} #{bugReport.ticketId}
              </Badge>
            )}
            {bugReport.autoFixStatus && (
              <Badge className={formatAutoFixStatus(bugReport.autoFixStatus).color}>
                {formatAutoFixStatus(bugReport.autoFixStatus).label}
              </Badge>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <Button href={`/project/${project}/enhance?id=${bugReport.id}`} color="blue">
            <SparklesIcon className="h-5 w-5" />
            Enhance & Fix
          </Button>
          {bugReport.screenshot && (
            <Button href={`/project/${project}/bug-reports/${bugReport.id}/media/${bugReport.screenshot.id}`} plain>
              <EyeIcon className="h-5 w-5" />
              View Screenshot
            </Button>
          )}
        </div>
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Subheading>Description</Subheading>
          <div className="mt-4 rounded-lg border border-zinc-200 bg-white p-6">
            <p className="text-zinc-700">{bugReport.description}</p>
          </div>

          {bugReport.metadata.errors.length > 0 && (
            <>
              <Subheading className="mt-8">JavaScript Errors</Subheading>
              <div className="mt-4 space-y-4">
                {bugReport.metadata.errors.map((error, index) => (
                  <div key={index} className="rounded-lg border border-red-200 bg-red-50 p-4">
                    <div className="font-medium text-red-900">{error.message}</div>
                    {error.stack && (
                      <pre className="mt-2 text-sm text-red-700 whitespace-pre-wrap">{error.stack}</pre>
                    )}
                    {error.filename && (
                      <div className="mt-2 text-sm text-red-600">
                        {error.filename}:{error.lineno}:{error.colno}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}

          {bugReport.metadata.console.length > 0 && (
            <>
              <Subheading className="mt-8">Console Logs</Subheading>
              <div className="mt-4 space-y-2">
                {bugReport.metadata.console.map((log, index) => (
                  <div key={index} className={`rounded p-3 text-sm ${
                    log.level === 'error' ? 'bg-red-50 text-red-900' :
                    log.level === 'warn' ? 'bg-yellow-50 text-yellow-900' :
                    'bg-gray-50 text-gray-900'
                  }`}>
                    <span className="font-medium uppercase">{log.level}:</span> {log.message}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        <div>
          <Subheading>Technical Details</Subheading>
          <Table className="mt-4">
            <TableBody>
              <TableRow>
                <TableCell className="font-medium">Browser</TableCell>
                <TableCell>{bugReport.metadata.browser.name} {bugReport.metadata.browser.version}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">OS</TableCell>
                <TableCell>{bugReport.metadata.os.name} {bugReport.metadata.os.version}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Screen Size</TableCell>
                <TableCell>{bugReport.metadata.screen.width}×{bugReport.metadata.screen.height}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Viewport</TableCell>
                <TableCell>{bugReport.metadata.screen.viewportWidth}×{bugReport.metadata.screen.viewportHeight}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Page URL</TableCell>
                <TableCell className="break-all">{bugReport.metadata.pageUrl}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Timestamp</TableCell>
                <TableCell>{new Date(bugReport.metadata.timestamp).toLocaleString()}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </div>
    </>
  )
}