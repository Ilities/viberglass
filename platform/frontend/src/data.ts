import {
  triggerAutoFix as apiTriggerAutoFix,
  BugReport,
  BugReportSummary,
  getBugReport,
  getBugReports,
  getMockBugReports,
  getMockBugReportStats,
} from '@/service/api/bug-report-api'

// Bug report functions
export async function getRecentBugReports(projectSlug: string): Promise<BugReportSummary[]> {
  try {
    const bugReports = await getBugReports(undefined, 10, 0, projectSlug)
    return bugReports.map((report) => ({
      id: report.id,
      title: report.title,
      severity: report.severity,
      category: report.category,
      timestamp: report.timestamp,
      ticketId: report.ticketId,
      ticketSystem: report.ticketSystem,
      autoFixStatus: report.autoFixStatus,
      status: report.ticketId ? 'resolved' : report.autoFixStatus === 'in_progress' ? 'in_progress' : 'open',
    }))
  } catch (error) {
    // Fall back to mock data if API is not available
    console.warn('Using mock data for bug reports:', error)
    return getMockBugReports()
  }
}

export async function getBugReportDetails(id: string): Promise<BugReport | null> {
  try {
    return await getBugReport(id)
  } catch (error) {
    console.warn('Failed to fetch bug report details:', error)
    return null
  }
}

export async function getBugReportStats() {
  try {
    // In a real implementation, you'd have an API endpoint for stats
    // For now, return mock stats
    return getMockBugReportStats()
  } catch (error) {
    console.warn('Failed to fetch bug report stats:', error)
    return getMockBugReportStats()
  }
}

// Utility functions for bug report formatting
export function formatSeverity(severity: string): { label: string; color: string } {
  switch (severity) {
    case 'critical':
      return { label: 'Critical', color: 'bg-red-100 text-red-800' }
    case 'high':
      return { label: 'High', color: 'bg-orange-100 text-orange-800' }
    case 'medium':
      return { label: 'Medium', color: 'bg-yellow-100 text-yellow-800' }
    case 'low':
      return { label: 'Low', color: 'bg-green-100 text-green-800' }
    default:
      return { label: 'Unknown', color: 'bg-gray-100 text-gray-800' }
  }
}

export function formatAutoFixStatus(status?: string): { label: string; color: string } {
  switch (status) {
    case 'completed':
      return { label: 'Fixed', color: 'bg-green-100 text-green-800' }
    case 'in_progress':
      return { label: 'Fixing', color: 'bg-blue-100 text-blue-800' }
    case 'pending':
      return { label: 'Pending', color: 'bg-yellow-100 text-yellow-800' }
    case 'failed':
      return { label: 'Failed', color: 'bg-red-100 text-red-800' }
    default:
      return { label: 'Not Requested', color: 'bg-gray-100 text-gray-800' }
  }
}

export function formatTicketSystem(system: string): string {
  const systems: Record<string, string> = {
    github: 'GitHub',
    linear: 'Linear',
    jira: 'Jira',
    gitlab: 'GitLab',
    azure: 'Azure DevOps',
    asana: 'Asana',
    trello: 'Trello',
    monday: 'Monday',
    clickup: 'ClickUp',
  }
  return systems[system] || system
}

export function formatTimestamp(date: Date): string {
  const now = new Date()
  const diffInHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60)

  if (diffInHours < 1) {
    return 'Just now'
  } else if (diffInHours < 24) {
    return `${Math.floor(diffInHours)}h ago`
  } else {
    return date.toLocaleDateString()
  }
}

export async function triggerAutoFix(ticketId: string, ticketSystem: string, repositoryUrl?: string): Promise<void> {
  try {
    await apiTriggerAutoFix(ticketId, ticketSystem, repositoryUrl)
  } catch (error) {
    console.warn('Failed to trigger auto-fix:', error)
    // Fall back to mock success for development
  }
}

// Mock data for events and orders (leftover from Catalyst demo)
export interface Event {
  id: string
  name: string
  date: string
  time: string
  location: string
  imgUrl: string
  status: string
  totalRevenue: number
  totalRevenueChange: number
  ticketsSold: number
  ticketsAvailable: number
  ticketsSoldChange: number
  pageViews: number
  pageViewsChange: number
}

export interface Order {
  id: string
  date: string
  customer: {
    name: string
    email: string
    address: string
    country: string
    countryFlagUrl: string
  }
  event: {
    name: string
    thumbUrl: string
    url: string
  }
  amount: {
    usd: number
    cad: number
    fee: number
    net: number
  }
  payment: {
    transactionId: string
    card: {
      type: string
      number: string
      expiry: string
    }
  }
}

export async function getEvents(): Promise<Event[]> {
  return [
    {
      id: '1',
      name: 'Summer Music Festival',
      date: 'Jul 15, 2024',
      time: '7:00 PM',
      location: 'Central Park',
      imgUrl: '/events/summer-festival.jpg',
      status: 'On Sale',
      totalRevenue: 125000,
      totalRevenueChange: 12.5,
      ticketsSold: 2500,
      ticketsAvailable: 5000,
      ticketsSoldChange: 8.3,
      pageViews: 15000,
      pageViewsChange: -2.1,
    },
    {
      id: '2',
      name: 'Tech Conference 2024',
      date: 'Aug 20, 2024',
      time: '9:00 AM',
      location: 'Convention Center',
      imgUrl: '/events/tech-conference.jpg',
      status: 'Sold Out',
      totalRevenue: 75000,
      totalRevenueChange: -5.2,
      ticketsSold: 1500,
      ticketsAvailable: 1500,
      ticketsSoldChange: 0,
      pageViews: 8500,
      pageViewsChange: 15.7,
    },
  ]
}

export async function getEvent(id: string): Promise<Event | undefined> {
  const events = await getEvents()
  return events.find((event) => event.id === id)
}

export async function getEventOrders(eventId: string): Promise<Order[]> {
  return [
    {
      id: 'ORD-001',
      date: 'Jun 15, 2024',
      customer: {
        name: 'John Doe',
        email: 'john@example.com',
        address: '123 Main St, New York, NY 10001',
        country: 'United States',
        countryFlagUrl: '/flags/us.svg',
      },
      event: {
        name: 'Summer Music Festival',
        thumbUrl: '/events/summer-festival-thumb.jpg',
        url: `/events/${eventId}`,
      },
      amount: {
        usd: 150,
        cad: 200,
        fee: 7.5,
        net: 192.5,
      },
      payment: {
        transactionId: 'txn_1234567890',
        card: {
          type: 'Visa',
          number: '4242',
          expiry: '12/26',
        },
      },
    },
  ]
}

export async function getOrders(): Promise<Order[]> {
  return [
    {
      id: 'ORD-001',
      date: 'Jun 15, 2024',
      customer: {
        name: 'John Doe',
        email: 'john@example.com',
        address: '123 Main St, New York, NY 10001',
        country: 'United States',
        countryFlagUrl: '/flags/us.svg',
      },
      event: {
        name: 'Summer Music Festival',
        thumbUrl: '/events/summer-festival-thumb.jpg',
        url: '/events/1',
      },
      amount: {
        usd: 150,
        cad: 200,
        fee: 7.5,
        net: 192.5,
      },
      payment: {
        transactionId: 'txn_1234567890',
        card: {
          type: 'Visa',
          number: '4242',
          expiry: '12/26',
        },
      },
    },
    {
      id: 'ORD-002',
      date: 'Jun 16, 2024',
      customer: {
        name: 'Jane Smith',
        email: 'jane@example.com',
        address: '456 Oak Ave, Toronto, ON M5V 1A1',
        country: 'Canada',
        countryFlagUrl: '/flags/ca.svg',
      },
      event: {
        name: 'Tech Conference 2024',
        thumbUrl: '/events/tech-conference-thumb.jpg',
        url: '/events/2',
      },
      amount: {
        usd: 300,
        cad: 400,
        fee: 15,
        net: 385,
      },
      payment: {
        transactionId: 'txn_0987654321',
        card: {
          type: 'Mastercard',
          number: '5555',
          expiry: '08/25',
        },
      },
    },
  ]
}

export async function getOrder(id: string): Promise<Order | undefined> {
  const orders = await getOrders()
  return orders.find((order) => order.id === id)
}

// Mock countries data (leftover from Catalyst demo)
export interface Country {
  name: string
  code: string
  flagUrl: string
  regions: string[]
}

export function getCountries(): Country[] {
  return [
    {
      name: 'United States',
      code: 'US',
      flagUrl: '/flags/us.svg',
      regions: [
        'Alabama',
        'Alaska',
        'Arizona',
        'Arkansas',
        'California',
        'Colorado',
        'Connecticut',
        'Delaware',
        'Florida',
        'Georgia',
        'Hawaii',
        'Idaho',
        'Illinois',
        'Indiana',
        'Iowa',
        'Kansas',
        'Kentucky',
        'Louisiana',
        'Maine',
        'Maryland',
        'Massachusetts',
        'Michigan',
        'Minnesota',
        'Mississippi',
        'Missouri',
        'Montana',
        'Nebraska',
        'Nevada',
        'New Hampshire',
        'New Jersey',
        'New Mexico',
        'New York',
        'North Carolina',
        'North Dakota',
        'Ohio',
        'Oklahoma',
        'Oregon',
        'Pennsylvania',
        'Rhode Island',
        'South Carolina',
        'South Dakota',
        'Tennessee',
        'Texas',
        'Utah',
        'Vermont',
        'Virginia',
        'Washington',
        'West Virginia',
        'Wisconsin',
        'Wyoming',
      ],
    },
    {
      name: 'Canada',
      code: 'CA',
      flagUrl: '/flags/ca.svg',
      regions: [
        'Alberta',
        'British Columbia',
        'Manitoba',
        'New Brunswick',
        'Newfoundland and Labrador',
        'Northwest Territories',
        'Nova Scotia',
        'Nunavut',
        'Ontario',
        'Prince Edward Island',
        'Quebec',
        'Saskatchewan',
        'Yukon',
      ],
    },
  ]
}
