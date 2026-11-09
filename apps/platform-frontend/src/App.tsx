import { BrowserRouter } from 'react-router-dom'
import { ThemeProvider } from '@/context/theme-context'
import { AuthProvider } from '@/context/auth-context'
import { DemoInstanceProvider } from '@/context/demo-instance-context'
import { AppRoutes } from '@/routes'
import { ErrorBoundary } from '@/components/error-boundary'

export function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <ThemeProvider>
          <DemoInstanceProvider>
            <AuthProvider>
              <AppRoutes />
            </AuthProvider>
          </DemoInstanceProvider>
        </ThemeProvider>
      </BrowserRouter>
    </ErrorBoundary>
  )
}
