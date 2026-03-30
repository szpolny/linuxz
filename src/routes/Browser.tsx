import { useQuery } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import { listServers } from '../lib/api.ts'
import type { ServerRecord } from '../lib/contracts.ts'
import { parseBrowserFilters, toBrowserSearchParams } from '../state/filters.ts'
import { Users, Wifi, Map as MapIcon, Globe, Search, Filter, ChevronLeft, ChevronRight, LayoutGrid } from 'lucide-react'

function getPingClass(ping: number | null) {
  if (ping === null) return ''
  if (ping < 50) return 'ping-good'
  if (ping < 120) return 'ping-warn'
  return 'ping-bad'
}

function ServerCard({ server }: { server: ServerRecord }) {
  return (
    <Link className="server-row" to={`/servers/${encodeURIComponent(server.endpoint)}`}>
      <div className="server-header">
        <div>
          <h3 className="server-name">{server.displayName}</h3>
          <div className="muted">{server.endpoint}</div>
        </div>
        <span className={`badge ${server.modded ? 'badge-good' : ''}`}>
          {server.modded ? 'Modded' : 'Vanilla-ish'}
        </span>
      </div>
      <div className="pill-row">
        <div className="stat">
          <Users size={14} className="stat-icon" />
          <div className="stat-value">
            {server.players}/{server.maxPlayers}
          </div>
        </div>
        <div className="stat">
          <Wifi size={14} className={`stat-icon ${getPingClass(server.ping)}`} />
          <div className="stat-value">{server.ping === null ? 'N/A' : `${server.ping} ms`}</div>
        </div>
        <div className="stat">
          <MapIcon size={14} className="stat-icon" />
          <div className="stat-value">{server.map}</div>
        </div>
        <div className="stat">
          <Globe size={14} className="stat-icon" />
          <div className="stat-value">{server.country ?? 'Unknown'}</div>
        </div>
      </div>
    </Link>
  )
}

export function BrowserRoute() {
  const [searchParams, setSearchParams] = useSearchParams()
  const filters = parseBrowserFilters(searchParams)

  const serversQuery = useQuery({
    queryKey: ['servers', filters],
    queryFn: () => listServers(filters),
  })
  const paginationLabel = serversQuery.data ? `Page ${serversQuery.data.page}` : `Page ${filters.page}`

  function updateFilters(next: typeof filters) {
    setSearchParams(toBrowserSearchParams(next))
  }

  return (
    <div className="grid">
      <section className="card">
        <div className="card-title">
          <h2><Filter size={20} className="stat-icon" /> Filters</h2>
          <span className="badge">{paginationLabel}</span>
        </div>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="search">Search</label>
            <div style={{ position: 'relative' }}>
              <input
                id="search"
                style={{ paddingLeft: '38px' }}
                value={filters.search}
                onChange={(event) => {
                  updateFilters({ ...filters, page: 1, search: event.target.value })
                }}
                placeholder="Server name or IP..."
              />
              <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', opacity: 0.5 }} />
            </div>
          </div>
          <div className="field">
            <label htmlFor="playerFloor">Min. Players</label>
            <input
              id="playerFloor"
              min={0}
              step={1}
              type="number"
              value={filters.playerFloor}
              onChange={(event) => {
                updateFilters({ ...filters, page: 1, playerFloor: Number(event.target.value || 0) })
              }}
            />
          </div>
          <div className="field">
            <label htmlFor="limit">Show</label>
            <select
              id="limit"
              value={String(filters.limit)}
              onChange={(event) => {
                updateFilters({ ...filters, page: 1, limit: Number(event.target.value) })
              }}
            >
              <option value="25">25 per page</option>
              <option value="40">40 per page</option>
              <option value="50">50 per page</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="moddedOnly">Server Type</label>
            <select
              id="moddedOnly"
              value={filters.moddedOnly ? 'modded' : 'all'}
              onChange={(event) => {
                updateFilters({ ...filters, page: 1, moddedOnly: event.target.value === 'modded' })
              }}
            >
              <option value="all">All servers</option>
              <option value="modded">Modded only</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="sortBy">Order By</label>
            <select
              id="sortBy"
              value={filters.sortBy}
              onChange={(event) => {
                const sortBy = event.target.value === 'ping' ? 'ping' : 'players'
                updateFilters({ ...filters, page: 1, sortBy })
              }}
            >
              <option value="players">Players</option>
              <option value="ping">Ping</option>
            </select>
          </div>
        </div>
      </section>

      <section className="card">
        <div className="card-title">
          <h2><LayoutGrid size={20} className="stat-icon" /> Live Results</h2>
          <span className={`badge ${serversQuery.error ? 'badge-bad' : 'badge-good'}`}>
            {serversQuery.error ? 'Provider error' : 'All Providers Active'}
          </span>
        </div>
        {serversQuery.isLoading ? <div className="empty">Loading DayZ browser results...</div> : null}
        {serversQuery.error ? <div className="empty">Could not load the server list.</div> : null}
        {serversQuery.data && serversQuery.data.items.length === 0 ? (
          <div className="empty">No servers matched the current filters.</div>
        ) : null}
        {serversQuery.data ? (
          <>
            <div className="list">
              {serversQuery.data.items.map((server) => (
                <ServerCard key={server.endpoint} server={server} />
              ))}
            </div>
            <div className="pagination-row">
              <button
                className="button"
                disabled={!serversQuery.data.hasPreviousPage}
                onClick={() => {
                  updateFilters({ ...filters, page: Math.max(1, filters.page - 1) })
                }}
                type="button"
              >
                <ChevronLeft size={16} /> Previous
              </button>
              <span className="badge">
                Page {serversQuery.data.page} • {serversQuery.data.pageSize} per page
              </span>
              <button
                className="button"
                disabled={!serversQuery.data.hasNextPage}
                onClick={() => {
                  updateFilters({ ...filters, page: filters.page + 1 })
                }}
                type="button"
              >
                Next <ChevronRight size={16} />
              </button>
            </div>
          </>
        ) : null}
      </section>
    </div>
  )
}
