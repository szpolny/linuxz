import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import { getServerLibrary, listServers, saveServerFavorite } from '../lib/api.ts'
import type { ServerRecord } from '../lib/contracts.ts'
import { parseBrowserFilters, toBrowserSearchParams } from '../state/filters.ts'
import {
  Users,
  Wifi,
  Map as MapIcon,
  Globe,
  Search,
  Filter,
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  Star,
  History,
} from 'lucide-react'

function getPingClass(ping: number | null) {
  if (ping === null) return ''
  if (ping < 50) return 'ping-good'
  if (ping < 120) return 'ping-warn'
  return 'ping-bad'
}

function formatLastJoined(lastJoinedAt: string | null) {
  if (!lastJoinedAt) {
    return null
  }

  const date = new Date(lastJoinedAt)
  if (Number.isNaN(date.getTime())) {
    return null
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

type ServerCardProps = {
  server: ServerRecord
  onToggleFavorite: (server: ServerRecord) => void
  pendingEndpoint: string | null
}

function ServerCard({ server, onToggleFavorite, pendingEndpoint }: ServerCardProps) {
  const lastJoinedLabel = formatLastJoined(server.lastJoinedAt)
  const favoritePending = pendingEndpoint === server.endpoint

  return (
    <div className="server-row">
      <div className="server-card-top">
        <Link className="server-card-link" to={`/servers/${encodeURIComponent(server.endpoint)}`}>
          <div className="server-header">
            <div>
              <h3 className="server-name">{server.displayName}</h3>
              <div className="muted">{server.endpoint}</div>
              {lastJoinedLabel ? <div className="server-subtle">Last played {lastJoinedLabel}</div> : null}
            </div>
            <div className="button-row server-badge-row">
              {server.lastJoinedAt ? (
                <span className="badge">
                  <History size={13} /> Recent
                </span>
              ) : null}
              <span className={`badge ${server.modded ? 'badge-good' : ''}`}>
                {server.modded ? 'Modded' : 'Vanilla-ish'}
              </span>
            </div>
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
        <button
          aria-label={server.isFavorite ? 'Remove favorite server' : 'Add favorite server'}
          className={`button button-icon favorite-button ${server.isFavorite ? 'favorite-button-active' : ''}`}
          disabled={favoritePending}
          onClick={() => onToggleFavorite(server)}
          type="button"
        >
          <Star fill={server.isFavorite ? 'currentColor' : 'none'} size={16} />
        </button>
      </div>
    </div>
  )
}

type ServerShelfProps = {
  title: string
  emptyLabel: string
  servers: ServerRecord[]
  pendingEndpoint: string | null
  onToggleFavorite: (server: ServerRecord) => void
}

function ServerShelf({ title, emptyLabel, servers, pendingEndpoint, onToggleFavorite }: ServerShelfProps) {
  return (
    <section className="card">
      <div className="card-title">
        <h2>{title}</h2>
        <span className="badge">{servers.length}</span>
      </div>
      {servers.length === 0 ? (
        <div className="empty">{emptyLabel}</div>
      ) : (
        <div className="list">
          {servers.map((server) => (
            <ServerCard
              key={server.endpoint}
              onToggleFavorite={onToggleFavorite}
              pendingEndpoint={pendingEndpoint}
              server={server}
            />
          ))}
        </div>
      )}
    </section>
  )
}

export function BrowserRoute() {
  const [searchParams, setSearchParams] = useSearchParams()
  const queryClient = useQueryClient()
  const filters = parseBrowserFilters(searchParams)

  const serversQuery = useQuery({
    queryKey: ['servers', filters],
    queryFn: () => listServers(filters),
  })

  const serverLibraryQuery = useQuery({
    queryKey: ['server-library'],
    queryFn: getServerLibrary,
  })

  const favoriteMutation = useMutation({
    mutationFn: ({ server, favorite }: { server: ServerRecord; favorite: boolean }) => saveServerFavorite(server, favorite),
    onSuccess: (server) => {
      void queryClient.invalidateQueries({ queryKey: ['server-library'] })
      void queryClient.invalidateQueries({ queryKey: ['servers'] })
      void queryClient.invalidateQueries({ queryKey: ['server-details', server.endpoint] })
    },
  })

  const paginationLabel = serversQuery.data ? `Page ${serversQuery.data.page}` : `Page ${filters.page}`
  const pendingEndpoint = favoriteMutation.isPending ? favoriteMutation.variables?.server.endpoint ?? null : null

  function updateFilters(next: typeof filters) {
    setSearchParams(toBrowserSearchParams(next))
  }

  function toggleFavorite(server: ServerRecord) {
    favoriteMutation.mutate({ server, favorite: !server.isFavorite })
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

      <div className="server-library-grid">
        <ServerShelf
          emptyLabel="Favorite servers will stay pinned here."
          onToggleFavorite={toggleFavorite}
          pendingEndpoint={pendingEndpoint}
          servers={serverLibraryQuery.data?.favorites ?? []}
          title="Favorite Servers"
        />
        <ServerShelf
          emptyLabel="Recently launched servers will appear here."
          onToggleFavorite={toggleFavorite}
          pendingEndpoint={pendingEndpoint}
          servers={serverLibraryQuery.data?.recents ?? []}
          title="Recent Servers"
        />
      </div>

      <section className="card">
        <div className="card-title">
          <h2><LayoutGrid size={20} className="stat-icon" /> Live Results</h2>
          <span className={`badge ${serversQuery.error ? 'badge-bad' : 'badge-good'}`}>
            {serversQuery.error ? 'Provider error' : 'All Providers Active'}
          </span>
        </div>
        {serverLibraryQuery.error ? <div className="empty">Saved server activity could not be loaded.</div> : null}
        {serversQuery.isLoading ? <div className="empty">Loading DayZ browser results...</div> : null}
        {serversQuery.error ? <div className="empty">Could not load the server list.</div> : null}
        {serversQuery.data && serversQuery.data.items.length === 0 ? (
          <div className="empty">No servers matched the current filters.</div>
        ) : null}
        {serversQuery.data ? (
          <>
            <div className="list">
              {serversQuery.data.items.map((server) => (
                <ServerCard
                  key={server.endpoint}
                  onToggleFavorite={toggleFavorite}
                  pendingEndpoint={pendingEndpoint}
                  server={server}
                />
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
