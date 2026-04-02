import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { startTransition, useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { getServerLibrary, listServers, saveServerFavorite } from '../lib/api.ts'
import type { ServerRecord } from '../lib/contracts.ts'
import { parseBrowserFilters, toBrowserSearchParams } from '../state/filters.ts'
import {
  Users,
  Wifi,
  Map as MapIcon,
  Globe,
  Package,
  Search,
  Filter,
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  Star,
  History,
  RefreshCw,
  SearchX,
  ServerOff,
  Play,
} from 'lucide-react'
import { ServerCardSkeleton } from '../components/ui/Skeleton.tsx'
import { EmptyState } from '../components/ui/EmptyState.tsx'
import { Input } from '../components/ui/Input.tsx'

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
  const modCountLabel =
    server.modded && server.modCount === 0 && !server.sourceCoverage.includes('dzsa')
      ? '? mods'
      : `${server.modCount} mods`

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
              {server.official ? <span className="badge badge-good">Official</span> : null}
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
              <Package size={14} className="stat-icon" />
              <div className="stat-value">{modCountLabel}</div>
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

export function BrowserRoute() {
  const [searchParams, setSearchParams] = useSearchParams()
  const queryClient = useQueryClient()
  const filters = parseBrowserFilters(searchParams)
  const [searchInput, setSearchInput] = useState(filters.search)

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
  const serverTypeValue = filters.officialOnly ? 'official' : filters.moddedOnly ? 'modded' : 'all'

  function updateFilters(next: typeof filters) {
    setSearchParams(toBrowserSearchParams(next))
  }

  useEffect(() => {
    setSearchInput(filters.search)
  }, [filters.search])

  useEffect(() => {
    if (searchInput === filters.search) {
      return
    }

    const timeoutId = window.setTimeout(() => {
      startTransition(() => {
        updateFilters({ ...filters, page: 1, search: searchInput })
      })
    }, 250)

    return () => window.clearTimeout(timeoutId)
  }, [filters, searchInput])

  function toggleFavorite(server: ServerRecord) {
    favoriteMutation.mutate({ server, favorite: !server.isFavorite })
  }

  function handleRefresh() {
    void serversQuery.refetch()
    void serverLibraryQuery.refetch()
  }

  const mostRecentServer = serverLibraryQuery.data?.recents[0]

  return (
    <div className="grid">
      {mostRecentServer ? (
        <section className="card hero-card" style={{ marginBottom: '4px' }}>
          <div className="card-title">
            <h2>
              <History size={20} className="stat-icon" /> Quick Join
            </h2>
            <span className="badge">Last played {formatLastJoined(mostRecentServer.lastJoinedAt)}</span>
          </div>
          <div className="server-row" style={{ background: 'transparent', border: 'none', padding: 0 }}>
            <div className="server-card-top" style={{ alignItems: 'center' }}>
              <Link className="server-card-link" to={`/servers/${encodeURIComponent(mostRecentServer.endpoint)}`}>
                <div className="server-header">
                  <div>
                    <h3 className="server-name" style={{ fontSize: '1.2rem' }}>
                      {mostRecentServer.displayName}
                    </h3>
                    <div className="muted">{mostRecentServer.endpoint}</div>
                  </div>
                </div>
                <div className="pill-row">
                  <div className="stat">
                    <Users size={14} className="stat-icon" />
                    <div className="stat-value">
                      {mostRecentServer.players}/{mostRecentServer.maxPlayers}
                    </div>
                  </div>
                  <div className="stat">
                    <Wifi size={14} className={`stat-icon ${getPingClass(mostRecentServer.ping)}`} />
                    <div className="stat-value">
                      {mostRecentServer.ping === null ? 'N/A' : `${mostRecentServer.ping} ms`}
                    </div>
                  </div>
                  <div className="stat">
                    <MapIcon size={14} className="stat-icon" />
                    <div className="stat-value">{mostRecentServer.map}</div>
                  </div>
                </div>
              </Link>
              <Link
                className="button button-primary"
                style={{ height: '48px', paddingInline: '24px' }}
                to={`/servers/${encodeURIComponent(mostRecentServer.endpoint)}`}
              >
                <Play size={18} fill="currentColor" /> Play Now
              </Link>
            </div>
          </div>
        </section>
      ) : null}

      <section className="card">
        <div className="card-title">
          <h2><Filter size={20} className="stat-icon" /> Filters</h2>
          <div className="button-row">
             <button 
              className="button button-icon" 
              onClick={handleRefresh} 
              disabled={serversQuery.isFetching}
              aria-label="Refresh server list"
              title="Refresh"
            >
              <RefreshCw size={16} className={serversQuery.isFetching ? 'spin' : ''} />
            </button>
            <span className="badge">{paginationLabel}</span>
          </div>
        </div>
        <div className="form-grid">
          <Input
            id="search"
            icon={Search}
            label="Search"
            value={searchInput}
            onChange={(event) => {
              setSearchInput(event.target.value)
            }}
            placeholder="Server name or IP..."
          />
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
              value={serverTypeValue}
              onChange={(event) => {
                const serverType = event.target.value
                updateFilters({
                  ...filters,
                  page: 1,
                  moddedOnly: serverType === 'modded',
                  officialOnly: serverType === 'official',
                })
              }}
            >
              <option value="all">All servers</option>
              <option value="modded">Modded only</option>
              <option value="official">Official only</option>
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
        {serverLibraryQuery.error ? (
          <EmptyState icon={ServerOff} description="Saved server activity could not be loaded." />
        ) : null}
        {serversQuery.isLoading ? (
          <div className="list">
             {[1, 2, 3, 4, 5].map((i) => <ServerCardSkeleton key={i} />)}
          </div>
        ) : null}
        {serversQuery.error ? (
          <EmptyState icon={ServerOff} description="Could not load the server list." />
        ) : null}
        {serversQuery.data && serversQuery.data.items.length === 0 ? (
          <EmptyState icon={SearchX} title="No results" description="No servers matched the current filters." />
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
