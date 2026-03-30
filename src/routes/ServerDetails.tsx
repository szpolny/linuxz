import { useMutation, useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getJobStatus, getServerDetails, getSettings, launchServer, prepareJoin } from '../lib/api.ts'
import type { JoinPreparationRequest, ServerDetails } from '../lib/contracts.ts'
import { JoinJobPanel } from '../components/JoinJobPanel.tsx'
import { ArrowLeft, Play, Shield, Box, AlertTriangle, Activity, Globe, Users, Map as MapIcon } from 'lucide-react'

function createJoinRequest(details: ServerDetails, defaultPlayerName: string, preferredSteamInstallId: string | null, preferredProtonPath: string | null, enableBattlemetrics: boolean, enableDzsaProvider: boolean): JoinPreparationRequest {
  return {
    endpoint: details.server.endpoint,
    ip: details.server.ip,
    queryPort: details.server.queryPort,
    connectPort: details.server.connectPort,
    settings: {
      defaultPlayerName,
      launchMode: 'directProton',
      preferredSteamInstallId,
      preferredProtonPath,
      enableBattlemetrics,
      enableDzsaProvider,
    },
  }
}

export function ServerDetailsRoute() {
  const params = useParams()
  const endpoint = decodeURIComponent(params['endpoint'] ?? '')
  const [activeJobId, setActiveJobId] = useState<string | null>(null)

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
      ? createJoinRequest(
          detailsQuery.data,
          settingsQuery.data.defaultPlayerName,
          settingsQuery.data.preferredSteamInstallId,
          settingsQuery.data.preferredProtonPath,
          settingsQuery.data.enableBattlemetrics,
          settingsQuery.data.enableDzsaProvider,
        )
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

  return (
    <div className="grid two-column">
      <section className="card">
        <div className="card-title">
          <h2><Activity size={20} className="stat-icon" /> Server Details</h2>
          <Link className="button" to="/servers">
            <ArrowLeft size={16} /> Back
          </Link>
        </div>
        {detailsQuery.isLoading ? <div className="empty">Loading server details...</div> : null}
        {detailsQuery.error ? <div className="empty">Could not resolve the selected server.</div> : null}
        {details ? (
          <div className="stack">
            <div className="details-grid">
              <div className="detail-item">
                <div className="muted"><Globe size={14} inline-block /> Name</div>
                <div style={{ fontWeight: 600 }}>{details.server.displayName}</div>
              </div>
              <div className="detail-item">
                <div className="muted">Endpoint</div>
                <div>{details.server.endpoint}</div>
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
                <div className="empty">No required workshop mods were detected.</div>
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
              <button className="button" style={{ flex: 1 }} onClick={() => prepareMutation.mutate()} type="button">
                Verify Connection
              </button>
              <button className="button button-primary" style={{ flex: 1.5 }} onClick={() => launchMutation.mutate()} type="button">
                <Play size={16} fill="currentColor" /> Launch DayZ
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
          <div className="empty">Ready once server details load.</div>
        )}
      </section>
    </div>
  )
}
