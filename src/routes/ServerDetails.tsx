import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getJobStatus, getServerDetails, getSettings, launchServer, prepareJoin, saveServerFavorite } from '../lib/api.ts'
import type { JoinPreparationRequest, LaunchSettings, ServerDetails } from '../lib/contracts.ts'
import { JoinJobPanel } from '../components/JoinJobPanel.tsx'
import { 
  ArrowLeft, 
  Play, 
  Shield, 
  Box, 
  AlertTriangle, 
  Activity, 
  Globe, 
  Users, 
  Map as MapIcon, 
  Star, 
  History,
  Copy,
  Check,
  Loader2,
  ServerOff
} from 'lucide-react'
import { EmptyState } from '../components/ui/EmptyState.tsx'
import { Skeleton } from '../components/ui/Skeleton.tsx'

function createJoinRequest(details: ServerDetails, settings: LaunchSettings): JoinPreparationRequest {
  return {
    endpoint: details.server.endpoint,
    ip: details.server.ip,
    queryPort: details.server.queryPort,
    connectPort: details.server.connectPort,
    settings,
  }
}

function formatLastJoined(lastJoinedAt: string | null) {
  if (!lastJoinedAt) {
    return 'No recent launches yet'
  }

  const date = new Date(lastJoinedAt)
  if (Number.isNaN(date.getTime())) {
    return 'No recent launches yet'
  }

  return date.toLocaleString()
}

export function ServerDetailsRoute() {
  const params = useParams()
  const endpoint = decodeURIComponent(params['endpoint'] ?? '')
  const [activeJobId, setActiveJobId] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const queryClient = useQueryClient()

  const settingsQuery = useQuery({
    queryKey: ['settings'],
    queryFn: getSettings,
  })

  const detailsQuery = useQuery({
    queryKey: ['server-details', endpoint],
    queryFn: () => getServerDetails(endpoint),
    enabled: endpoint.length > 0,
    retry: 0,
  })

  const joinRequest =
    detailsQuery.data && settingsQuery.data
      ? createJoinRequest(detailsQuery.data, settingsQuery.data)
      : null

  const prepareMutation = useMutation({
    mutationFn: async () => {
      if (!joinRequest) {
        throw new Error('Join request is not ready')
      }
      return prepareJoin(joinRequest)
    },
  })

  const launchMutation = useMutation({
    mutationFn: async () => {
      if (!joinRequest) {
        throw new Error('Join request is not ready')
      }
      return launchServer(joinRequest)
    },
    onSuccess: (status) => {
      setActiveJobId(status.jobId)
    },
  })

  const favoriteMutation = useMutation({
    mutationFn: async () => {
      if (!detailsQuery.data) {
        throw new Error('Server details are not ready')
      }
      return saveServerFavorite(detailsQuery.data.server, !detailsQuery.data.server.isFavorite)
    },
    onSuccess: (server) => {
      void queryClient.invalidateQueries({ queryKey: ['server-library'] })
      void queryClient.invalidateQueries({ queryKey: ['servers'] })
      void queryClient.invalidateQueries({ queryKey: ['server-details', server.endpoint] })
    },
  })

  const jobQuery = useQuery({
    queryKey: ['job-status', activeJobId],
    queryFn: () => getJobStatus(activeJobId ?? ''),
    enabled: activeJobId !== null,
    refetchInterval: (query) => {
      const status = query.state.data
      if (!status) {
        return 1500
      }
      return status.phase === 'complete' || status.phase === 'blocked' ? false : 1500
    },
  })

  const details = detailsQuery.data

  useEffect(() => {
    if (jobQuery.data?.phase !== 'complete') {
      return
    }

    void queryClient.invalidateQueries({ queryKey: ['server-library'] })
    void queryClient.invalidateQueries({ queryKey: ['servers'] })
    void queryClient.invalidateQueries({ queryKey: ['server-details', endpoint] })
  }, [endpoint, jobQuery.data?.phase, queryClient])

  const handleCopy = () => {
    if (!details) return
    void navigator.clipboard.writeText(details.server.endpoint)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="grid two-column">
      <section className="card">
        <div className="card-title">
          <h2><Activity size={20} className="stat-icon" /> Server Details</h2>
          <div className="button-row">
            {details ? (
              <>
                <button
                  className="button button-icon"
                  onClick={handleCopy}
                  title="Copy IP Address"
                  aria-label="Copy IP Address"
                >
                  {copied ? <Check size={16} className="ping-good" /> : <Copy size={16} />}
                </button>
                <button
                  className={`button ${details.server.isFavorite ? 'favorite-toggle-active' : ''}`}
                  disabled={favoriteMutation.isPending}
                  onClick={() => favoriteMutation.mutate()}
                  type="button"
                >
                  <Star fill={details.server.isFavorite ? 'currentColor' : 'none'} size={16} />
                  {details.server.isFavorite ? 'Favorited' : 'Favorite'}
                </button>
              </>
            ) : null}
            <Link className="button" to="/servers">
              <ArrowLeft size={16} /> Back
            </Link>
          </div>
        </div>
        {detailsQuery.isLoading ? (
          <div className="stack">
            <div className="details-grid">
              {[1, 2, 3, 4, 5].map(i => (
                <div key={i} className="detail-item">
                  <Skeleton style={{ height: '14px', width: '40%', marginBottom: '8px' }} />
                  <Skeleton style={{ height: '18px', width: '80%' }} />
                </div>
              ))}
            </div>
          </div>
        ) : null}
        {detailsQuery.error ? <EmptyState icon={ServerOff} description="Could not resolve the selected server." /> : null}
        {details ? (
          <div className="stack">
            <div className="details-grid">
              <div className="detail-item">
                <div className="muted"><Globe size={14} inline-block /> Name</div>
                <div style={{ fontWeight: 600 }}>{details.server.displayName}</div>
              </div>
              <div className="detail-item">
                <div className="muted">Endpoint</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {details.server.endpoint}
                </div>
              </div>
              <div className="detail-item">
                <div className="muted"><History size={14} inline-block /> Last Played</div>
                <div>{formatLastJoined(details.server.lastJoinedAt)}</div>
              </div>
              <div className="detail-item">
                <div className="muted"><Users size={14} inline-block /> Players</div>
                <div>
                  {details.server.players}/{details.server.maxPlayers}
                </div>
              </div>
              <div className="detail-item">
                <div className="muted"><MapIcon size={14} inline-block /> Map</div>
                <div>{details.server.map}</div>
              </div>
            </div>

            <div className="stack">
              <div className="card-title" style={{ marginBottom: '12px' }}>
                <h3><Shield size={18} className="stat-icon" /> Providers</h3>
              </div>
              <div className="button-row">
                {details.providerProvenance.map((provider) => (
                  <span className="badge badge-good" key={provider}>
                    {provider}
                  </span>
                ))}
              </div>
            </div>

            <div className="stack">
              <div className="card-title" style={{ marginBottom: '12px' }}>
                <h3><Box size={18} className="stat-icon" /> Required Mods</h3>
                <span className="badge">{details.requiredMods.length}</span>
              </div>
              {details.requiredMods.length === 0 ? (
                <EmptyState description="No required workshop mods were detected." />
              ) : (
                <div className="mod-list">
                  {details.requiredMods.map((mod) => (
                    <div className="mod-row" key={mod.workshopId}>
                      <div>
                        <strong>{mod.displayName}</strong>
                        <div className="muted">{mod.workshopId}</div>
                      </div>
                      <span className="badge">{mod.source}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {details.warnings.length > 0 ? (
              <div className="stack">
                <div className="card-title" style={{ marginBottom: '4px' }}>
                  <h3><AlertTriangle size={18} style={{ color: 'var(--warn)' }} /> Warnings</h3>
                </div>
                {details.warnings.map((warning) => (
                  <div className="badge badge-warn" key={warning} style={{ width: '100%', justifyContent: 'flex-start' }}>
                    {warning}
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </section>

      <section className="card hero-card">
        <div className="card-title">
          <h2><Play size={20} className="stat-icon" /> Join Flow</h2>
          <span className="badge">{settingsQuery.data?.launchMode ?? 'loading'}</span>
        </div>
        {joinRequest ? (
          <div className="stack">
            <div className="detail-item">
              <div className="muted">Default Player Name</div>
              <div style={{ fontWeight: 600 }}>{joinRequest.settings.defaultPlayerName || 'Not Set'}</div>
            </div>
            
            <div className="button-row" style={{ marginTop: '12px' }}>
              <button 
                className="button" 
                style={{ flex: 1 }} 
                onClick={() => prepareMutation.mutate()} 
                type="button"
                disabled={prepareMutation.isPending}
              >
                {prepareMutation.isPending ? <Loader2 size={16} className="spin" /> : 'Verify Connection'}
              </button>
              <button 
                className="button button-primary" 
                style={{ flex: 1.5 }} 
                onClick={() => launchMutation.mutate()} 
                type="button"
                disabled={launchMutation.isPending}
              >
                {launchMutation.isPending ? <Loader2 size={16} className="spin" /> : (
                  <>
                    <Play size={16} fill="currentColor" /> Launch DayZ
                  </>
                )}
              </button>
            </div>

            {prepareMutation.data ? (
              <div className="stack" style={{ marginTop: '12px' }}>
                <div className="detail-item">
                  <div className="muted">Launch Mode</div>
                  <div>{prepareMutation.data.launchMode}</div>
                </div>
                <div className="detail-item">
                  <div className="muted">Launch Arguments</div>
                  <code style={{ fontSize: '0.8rem', opacity: 0.8, overflowWrap: 'break-word' }}>
                    {prepareMutation.data.launchArgs.join(' ') || 'No launch arguments generated.'}
                  </code>
                </div>
                {prepareMutation.data.blockingIssues.length > 0 ? (
                  <div className="stack">
                    {prepareMutation.data.blockingIssues.map((issue) => (
                      <div className="badge badge-bad" key={issue} style={{ width: '100%', justifyContent: 'flex-start' }}>
                        <AlertTriangle size={14} /> {issue}
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
            <JoinJobPanel status={jobQuery.data ?? launchMutation.data} />
          </div>
        ) : (
          detailsQuery.isLoading ? (
            <div className="stack">
              <Skeleton style={{ height: '60px', borderRadius: '12px' }} />
              <div className="button-row">
                <Skeleton style={{ height: '40px', flex: 1, borderRadius: '12px' }} />
                <Skeleton style={{ height: '40px', flex: 1.5, borderRadius: '12px' }} />
              </div>
            </div>
          ) : (
            <EmptyState description="Ready once server details load." />
          )
        )}
      </section>
    </div>
  )
}
