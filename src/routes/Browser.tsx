import { useQuery } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import { listServers } from '../lib/api.ts'
import type { ServerRecord } from '../lib/contracts.ts'
import { parseBrowserFilters, toBrowserSearchParams } from '../state/filters.ts'

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
          <div className="stat-label">Players</div>
          <div className="stat-value">
            {server.players}/{server.maxPlayers}
          </div>
        </div>
        <div className="stat">
          <div className="stat-label">Ping</div>
          <div className="stat-value">{server.ping === null ? 'N/A' : `${server.ping} ms`}</div>
        </div>
        <div className="stat">
          <div className="stat-label">Map</div>
          <div className="stat-value">{server.map}</div>
        </div>
        <div className="stat">
          <div className="stat-label">Country</div>
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
          <h2>Server Browser</h2>
          <span className="badge">{paginationLabel}</span>
        </div>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="search">Search</label>
            <input
              id="search"
              value={filters.search}
              onChange={(event) => {
                updateFilters({ ...filters, page: 1, search: event.target.value })
              }}
            />
          </div>
          <div className="field">
            <label htmlFor="playerFloor">Player floor</label>
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
            <label htmlFor="limit">Limit</label>
            <select
              id="limit"
              value={String(filters.limit)}
              onChange={(event) => {
                updateFilters({ ...filters, page: 1, limit: Number(event.target.value) })
              }}
            >
              <option value="25">25</option>
              <option value="40">40</option>
              <option value="50">50</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="moddedOnly">Mode</label>
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
            <label htmlFor="sortBy">Sort by</label>
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
          <h2>Live Results</h2>
          <span className={`badge ${serversQuery.error ? 'badge-bad' : 'badge-good'}`}>
            {serversQuery.error ? 'Provider error' : 'BattleMetrics + A2S + DZSA'}
          </span>
        </div>
        {serversQuery.isLoading ? <div className="empty">Loading DayZ browser results.</div> : null}
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
                Previous
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
                Next
              </button>
            </div>
          </>
        ) : null}
      </section>
    </div>
  )
}
