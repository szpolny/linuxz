import { getCurrentWindow } from '@tauri-apps/api/window'
import { NavLink, Outlet } from 'react-router-dom'

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
              -
            </button>
            <button aria-label="Toggle maximize window" className="window-button" onClick={() => void toggleMaximizeWindow()} type="button">
              +
            </button>
            <button aria-label="Close window" className="window-button window-button-close" onClick={() => void closeWindow()} type="button">
              x
            </button>
          </div>
        ) : null}
      </header>
      <header className="topbar">
        <div className="brand">
          <div>
            <h1>LinuxZ</h1>
            <p>BattleMetrics browser, DZSA enrichment, Steam-aware launch flow.</p>
          </div>
        </div>
        <nav className="topnav">
          <NavLink className="nav-link" to="/servers">
            Browser
          </NavLink>
          <NavLink className="nav-link" to="/mods">
            Mods
          </NavLink>
          <NavLink className="nav-link" to="/settings">
            Settings
          </NavLink>
        </nav>
      </header>
      <Outlet />
    </div>
  )
}
