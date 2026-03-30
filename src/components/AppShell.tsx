import { getCurrentWindow } from '@tauri-apps/api/window'
import { openUrl } from '@tauri-apps/plugin-opener'
import { NavLink, Outlet, Link } from 'react-router-dom'
import { Search, Package, Settings, Minus, Square, X, Star, History, Users, Wifi, Bug } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { getServerLibrary } from '../lib/api.ts'
import type { ServerRecord } from '../lib/contracts.ts'
import { Skeleton } from './ui/Skeleton.tsx'

const isTauriWindow = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
const issuesUrl = 'https://github.com/szpolny/linuxz/issues'

async function minimizeWindow() {
  await getCurrentWindow().minimize()
}

async function toggleMaximizeWindow() {
  const currentWindow = getCurrentWindow()
  const maximized = await currentWindow.isMaximized()
  if (maximized) {
    await currentWindow.unmaximize()
    return
  }
  await currentWindow.maximize()
}

async function closeWindow() {
  await getCurrentWindow().close()
}

async function openIssuesPage() {
  if (isTauriWindow) {
    await openUrl(issuesUrl)
    return
  }
  window.open(issuesUrl, '_blank', 'noopener,noreferrer')
}

function SidebarServerRow({ server }: { server: ServerRecord }) {
  return (
    <Link className="sidebar-server-row" to={`/servers/${encodeURIComponent(server.endpoint)}`}>
      <div className="sidebar-server-info">
        <span className="sidebar-server-name">{server.displayName}</span>
        <div className="sidebar-server-stats">
          <span className="sidebar-stat">
            <Users size={12} /> {server.players}
          </span>
          <span className="sidebar-stat">
            <Wifi size={12} /> {server.ping ?? '?'}
          </span>
        </div>
      </div>
    </Link>
  )
}

export function AppShell() {
  const libraryQuery = useQuery({
    queryKey: ['server-library'],
    queryFn: getServerLibrary,
  })

  return (
    <div className="shell">
      <header className="window-bar">
        <div className="window-drag" data-tauri-drag-region={true}>
          <div className="window-meta">
            <span className="window-appdot" />
            <span className="window-title">LinuxZ</span>
          </div>
        </div>
        <div className="window-toolbar">
          <a
            className="window-link-button"
            href={issuesUrl}
            onClick={(event) => {
              event.preventDefault()
              void openIssuesPage()
            }}
            rel="noreferrer"
            target="_blank"
          >
            <Bug size={14} />
            <span>Report issue</span>
          </a>
          {isTauriWindow ? (
            <div className="window-controls">
              <button aria-label="Minimize window" className="window-button" onClick={() => void minimizeWindow()} type="button">
                <Minus size={14} />
              </button>
              <button aria-label="Toggle maximize window" className="window-button" onClick={() => void toggleMaximizeWindow()} type="button">
                <Square size={12} />
              </button>
              <button aria-label="Close window" className="window-button window-button-close" onClick={() => void closeWindow()} type="button">
                <X size={14} />
              </button>
            </div>
          ) : null}
        </div>
      </header>

      <aside className="sidebar">
        <div className="sidebar-brand">
          <h1>LinuxZ</h1>
          <p>DayZ Launcher</p>
        </div>

        <nav className="side-nav">
          <NavLink className="nav-link" to="/servers">
            <Search size={18} />
            <span>Browser</span>
          </NavLink>
          <NavLink className="nav-link" to="/mods">
            <Package size={18} />
            <span>Mods</span>
          </NavLink>
          <NavLink className="nav-link" to="/settings">
            <Settings size={18} />
            <span>Settings</span>
          </NavLink>
        </nav>

        <div className="sidebar-section">
          <div className="sidebar-section-header">
            <Star size={14} /> <span>Favorites</span>
          </div>
          <div className="sidebar-list">
            {libraryQuery.isLoading ? (
              [1, 2].map((i) => <Skeleton key={i} style={{ height: '40px', marginBottom: '4px' }} />)
            ) : libraryQuery.data?.favorites.length === 0 ? (
              <div className="sidebar-empty">No favorites</div>
            ) : (
              libraryQuery.data?.favorites.slice(0, 5).map((server) => (
                <SidebarServerRow key={server.endpoint} server={server} />
              ))
            )}
          </div>
        </div>

        <div className="sidebar-section">
          <div className="sidebar-section-header">
            <History size={14} /> <span>Recently Played</span>
          </div>
          <div className="sidebar-list">
            {libraryQuery.isLoading ? (
              [1, 2].map((i) => <Skeleton key={i} style={{ height: '40px', marginBottom: '4px' }} />)
            ) : libraryQuery.data?.recents.length === 0 ? (
              <div className="sidebar-empty">No recents</div>
            ) : (
              libraryQuery.data?.recents.slice(0, 5).map((server) => (
                <SidebarServerRow key={server.endpoint} server={server} />
              ))
            )}
          </div>
        </div>
      </aside>

      <main className="main-content">
        <Outlet />
      </main>
    </div>
  )
}
