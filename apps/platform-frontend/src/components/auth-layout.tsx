import { Outlet } from 'react-router-dom'

export function AuthLayout() {
  return (
    <main className="app-canvas flex min-h-dvh flex-col p-3">
      <div className="app-frame flex grow items-center justify-center p-6 lg:p-10">
        <Outlet />
      </div>
    </main>
  )
}
