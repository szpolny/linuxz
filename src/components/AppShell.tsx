import { getCurrentWindow } from '@tauri-apps/api/window'
import { NavLink, Outlet } from 'react-router-dom'
import { Search, Package, Settings, Minus, Square, X } from 'lucide-react'

const isTauriWindow = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

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

export function AppShell() {
  return (
    <div className="shell">
      <header className="window-bar">
        <div className="window-drag" data-tauri-drag-region={true}>
          <div className="window-meta">
            <span className="window-appdot" />
            <span className="window-title">LinuxZ</span>
          </div>
        </div>
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
      </aside>

      <main className="main-content">
        <Outlet />
      </main>
    </div>
  )
}
