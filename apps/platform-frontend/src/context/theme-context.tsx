import { Theme as RadixTheme } from '@radix-ui/themes'
import { createContext, useContext, useEffect, useState } from 'react'
import type { AccentColor } from '@/lib/project-colors'

type AppTheme = 'light' | 'dark'

interface ThemeContextType {
  theme: AppTheme | null
  toggleTheme: () => void
  accentColor: AccentColor
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined)

interface ThemeProviderProps {
  children: React.ReactNode
  accentColor?: AccentColor
}

export function ThemeProvider({ children, accentColor = 'amber' }: ThemeProviderProps) {
  const [theme, setTheme] = useState<AppTheme | null>(null)

  const applyTheme = (newTheme: AppTheme) => {
    setTheme(newTheme)
    localStorage.setItem('theme', newTheme)
    if (newTheme === 'dark') {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }

  useEffect(() => {
    const savedTheme = localStorage.getItem('theme') as AppTheme | null
    const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
    const initialTheme = savedTheme || systemTheme

    applyTheme(initialTheme)
  }, [])

  const toggleTheme = () => {
    const activeTheme = theme ?? 'light'
    const newTheme = activeTheme === 'light' ? 'dark' : 'light'
    applyTheme(newTheme)
  }

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, accentColor }}>
      <RadixTheme appearance={theme ?? 'light'} accentColor={accentColor} grayColor="sand" radius="none">
        {children}
      </RadixTheme>
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const context = useContext(ThemeContext)
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider')
  }
  return context
}
