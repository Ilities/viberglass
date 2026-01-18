import { Stat } from '@/app/stat'
import { Heading, Subheading } from '@/components/heading'
import { Select } from '@/components/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/table'
import { Badge } from '@/components/badge'
import { getRecentBugReports, getBugReportStats, formatSeverity, formatAutoFixStatus, formatTicketSystem, formatTimestamp } from '@/data'

export default async function Home({
  params,
}: {
  params: Promise<{ project: string }>
}) {
  const { project } = await params
  const [bugReports, stats] = await Promise.all([
    getRecentBugReports(project),
    getBugReportStats()
  ])

  return (
    <>
      <Heading>Good morning, Developer</Heading>
      <div className="mt-8 flex items-end justify-between">
        <Subheading>Overview</Subheading>
        <div>
          <Select name="period">
            <option value="last_week">Last week</option>
            <option value="last_two">Last two weeks</option>
            <option value="last_month">Last month</option>
            <option value="last_quarter">Last quarter</option>
          </Select>
        </div>
      </div>
      <div className="mt-4 grid gap-8 sm:grid-cols-2 xl:grid-cols-4">
        <Stat title="Total bug reports" value={stats.total.toString()} change="+12.5%" />
        <Stat title="Open issues" value={stats.open.toString()} change="-2.1%" />
        <Stat title="Auto-fix requested" value={stats.autoFixStats.requested.toString()} change="+8.3%" />
        <Stat title="Resolved this week" value={stats.resolved.toString()} change="+15.2%" />
      </div>
      <Subheading className="mt-14">Recent bug reports</Subheading>
      <Table className="mt-4 [--gutter:--spacing(6)] lg:[--gutter:--spacing(10)]">
        <TableHead>
          <TableRow>
            <TableHeader>Title</TableHeader>
            <TableHeader>Severity</TableHeader>
            <TableHeader>Category</TableHeader>
            <TableHeader>Status</TableHeader>
            <TableHeader>Reported</TableHeader>
          </TableRow>
        </TableHead>
        <TableBody>
          {bugReports.map((report) => (
            <TableRow key={report.id} href={`/project/${project}/bug-reports/${report.id}`} title={`Bug #${report.id}`}>
              <TableCell className="font-medium">{report.title}</TableCell>
              <TableCell>
                <Badge className={formatSeverity(report.severity).color}>
                  {formatSeverity(report.severity).label}
                </Badge>
              </TableCell>
              <TableCell>{report.category}</TableCell>
              <TableCell>
                {report.ticketId ? (
                  <div className="flex items-center gap-2">
                    <Badge className="bg-blue-100 text-blue-800">
                      {formatTicketSystem(report.ticketSystem)}
                    </Badge>
                    {report.autoFixStatus && (
                      <Badge className={formatAutoFixStatus(report.autoFixStatus).color}>
                        {formatAutoFixStatus(report.autoFixStatus).label}
                      </Badge>
                    )}
                  </div>
                ) : (
                  <Badge className="bg-gray-100 text-gray-800">
                    {report.status === 'in_progress' ? 'In Progress' : 'Open'}
                  </Badge>
                )}
              </TableCell>
              <TableCell className="text-zinc-500">{formatTimestamp(report.timestamp)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </>
  )
}
