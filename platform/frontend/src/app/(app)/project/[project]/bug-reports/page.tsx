import { Badge } from '@/components/badge'
import { Button } from '@/components/button'
import { Heading } from '@/components/heading'
import { Input } from '@/components/input'
import { Select } from '@/components/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/table'
import { formatAutoFixStatus, formatSeverity, formatTimestamp, getRecentBugReports } from '@/data'
import { FunnelIcon, MagnifyingGlassIcon } from '@heroicons/react/20/solid'

export default async function BugReportsPage({
  params,
  searchParams,
}: {
  params: Promise<{ project: string }>
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const { project } = await params
  const bugReports = await getRecentBugReports(project)
  const searchP = await searchParams

  // Parse search params
  const status = searchP.status as string
  const severity = searchP.severity as string
  const search = searchP.search as string

  // Filter bug reports based on search params
  const filteredReports = bugReports.filter((report) => {
    if (status && report.status !== status) return false
    if (severity && report.severity !== severity) return false
    if (search && !report.title.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  return (
    <>
      <div className="flex items-end justify-between">
        <Heading>Bug Reports</Heading>
        <div className="flex gap-4">
          <Button href={`/project/${project}/enhance`} color="brand">
            Enhance & Auto-Fix
          </Button>
        </div>
      </div>

      <div className="mt-8 flex items-center gap-4">
        <div className="min-w-[300px] flex-[2]">
          <div className="relative">
            <MagnifyingGlassIcon className="absolute top-1/2 left-3 h-5 w-5 -translate-y-1/2 text-zinc-400" />
            <Input
              type="search"
              placeholder="Search bug reports..."
              className="pl-10"
              name="search"
              defaultValue={search}
            />
          </div>
        </div>
        <Select name="status" defaultValue={status}>
          <option value="">All Status</option>
          <option value="open">Open</option>
          <option value="resolved">Resolved</option>
          <option value="in_progress">In Progress</option>
        </Select>
        <Select name="severity" defaultValue={severity}>
          <option value="">All Severities</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </Select>
        <Button plain>
          <FunnelIcon className="h-5 w-5" />
          Filters
        </Button>
      </div>

      <Table className="mt-8 [--gutter:--spacing(6)] lg:[--gutter:--spacing(10)]">
        <TableHead>
          <TableRow>
            <TableHeader>Title</TableHeader>
            <TableHeader>Severity</TableHeader>
            <TableHeader>Category</TableHeader>
            <TableHeader>Status</TableHeader>
            <TableHeader>Auto-Fix</TableHeader>
            <TableHeader>Reported</TableHeader>
          </TableRow>
        </TableHead>
        <TableBody>
          {filteredReports.map((report) => (
            <TableRow key={report.id} href={`/project/${project}/bug-reports/${report.id}`}>
              <TableCell className="font-medium">{report.title}</TableCell>
              <TableCell>
                <Badge className={formatSeverity(report.severity).color}>{formatSeverity(report.severity).label}</Badge>
              </TableCell>
              <TableCell>{report.category}</TableCell>
              <TableCell>
                <Badge
                  className={
                    report.status === 'resolved'
                      ? 'bg-green-100 text-green-800'
                      : report.status === 'in_progress'
                        ? 'bg-blue-100 text-blue-800'
                        : 'bg-gray-100 text-gray-800'
                  }
                >
                  {report.status === 'in_progress'
                    ? 'In Progress'
                    : report.status.charAt(0).toUpperCase() + report.status.slice(1)}
                </Badge>
              </TableCell>
              <TableCell>
                {report.autoFixStatus ? (
                  <Badge className={formatAutoFixStatus(report.autoFixStatus).color}>
                    {formatAutoFixStatus(report.autoFixStatus).label}
                  </Badge>
                ) : (
                  <span className="text-zinc-400">—</span>
                )}
              </TableCell>
              <TableCell className="text-zinc-500">{formatTimestamp(report.timestamp)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {filteredReports.length === 0 && (
        <div className="mt-8 text-center">
          <p className="text-zinc-500">No bug reports found matching your criteria.</p>
        </div>
      )}
    </>
  )
}
