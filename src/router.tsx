import { useQuery } from '@tanstack/react-query'
import { Navigate, Outlet, createBrowserRouter, useLocation } from 'react-router-dom'
import { AppShell } from './components/AppShell.tsx'
import { getSettings } from './lib/api.ts'
import { BrowserRoute } from './routes/Browser.tsx'
import { ModsRoute } from './routes/Mods.tsx'
import { OnboardingRoute } from './routes/Onboarding.tsx'
import { ServerDetailsRoute } from './routes/ServerDetails.tsx'
import { SettingsRoute } from './routes/Settings.tsx'

function OnboardingGate() {
  const location = useLocation()
  const settingsQuery = useQuery({
    queryKey: ['settings'],
    queryFn: getSettings,
  })

  if (settingsQuery.isLoading) {
    return (
      <div className="route-status-shell">
        <div className="card route-status-card">
          <div className="empty">Loading launcher settings...</div>
        </div>
      </div>
    )
  }

  if (settingsQuery.error || !settingsQuery.data) {
    return (
      <div className="route-status-shell">
        <div className="card route-status-card">
          <div className="empty">Launcher settings could not be loaded.</div>
        </div>
      </div>
    )
  }

  const onOnboardingRoute = location.pathname === '/onboarding'

  if (!settingsQuery.data.onboardingCompleted && !onOnboardingRoute) {
    return <Navigate replace={true} to="/onboarding" />
  }

  if (settingsQuery.data.onboardingCompleted && onOnboardingRoute) {
    return <Navigate replace={true} to="/servers" />
  }

  return <Outlet />
}

export const router = createBrowserRouter([
  {
    path: '/',
    element: <OnboardingGate />,
    children: [
      {
        path: 'onboarding',
        element: <OnboardingRoute />,
      },
      {
        element: <AppShell />,
        children: [
          {
            index: true,
            element: <Navigate replace={true} to="/servers" />,
          },
          {
            path: 'servers',
            element: <BrowserRoute />,
          },
          {
            path: 'servers/:endpoint',
            element: <ServerDetailsRoute />,
          },
          {
            path: 'settings',
            element: <SettingsRoute />,
          },
          {
            path: 'mods',
            element: <ModsRoute />,
          },
        ],
      },
    ],
  },
])
