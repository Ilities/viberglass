import '@/styles/tailwind.css'
import type { Metadata } from 'next'
import { Inter, Orbitron, Space_Mono } from 'next/font/google'

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
    template: '%s - Viberator',
    default: 'Viberator',
  },
  description: 'AI-powered bug fixing orchestrator',
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${orbitron.variable} ${spaceMono.variable} text-zinc-950 antialiased lg:bg-zinc-100 dark:bg-zinc-900 dark:text-white dark:lg:bg-zinc-950`}
    >
      <body>{children}</body>
    </html>
  )
}
