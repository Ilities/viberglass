import '@radix-ui/themes/styles.css'
import '@/styles/tailwind.css'
import { AuthProvider } from '@/context/auth-context'
import { ThemeProvider } from '@/context/theme-context'
import type { Metadata } from 'next'
import { Inter, Orbitron, Space_Mono } from 'next/font/google'

// Force dynamic rendering for SSR - data fetched at request time, not build time
// Required for Amplify hosting with backend API calls
export const dynamic = 'force-dynamic'

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
})

const orbitron = Orbitron({
  subsets: ['latin'],
  weight: '900',
  display: 'swap',
  variable: '--font-orbitron',
})

const spaceMono = Space_Mono({
  subsets: ['latin'],
  weight: ['400', '700'],
  display: 'swap',
  variable: '--font-space-mono',
})

export const metadata: Metadata = {
  title: {
    template: '%s - Viberglass',
    default: 'Viberglass',
  },
  description: 'AI-powered bug fixing orchestrator',
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${orbitron.variable} ${spaceMono.variable} suppress-transition text-zinc-950 antialiased`}
      suppressHydrationWarning
    >
      <body>
        <ThemeProvider>
          <AuthProvider>{children}</AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
