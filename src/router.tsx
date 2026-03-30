import { Navigate, createBrowserRouter } from 'react-router-dom'
import { AppShell } from './components/AppShell.tsx'
import { BrowserRoute } from './routes/Browser.tsx'
import { ModsRoute } from './routes/Mods.tsx'
import { ServerDetailsRoute } from './routes/ServerDetails.tsx'
import { SettingsRoute } from './routes/Settings.tsx'

export const router = createBrowserRouter([
  {
    path: '/',
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
])
