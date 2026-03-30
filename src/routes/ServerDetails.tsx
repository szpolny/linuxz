import { useMutation, useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getJobStatus, getServerDetails, getSettings, launchServer, prepareJoin } from '../lib/api.ts'
import type { JoinPreparationRequest, ServerDetails } from '../lib/contracts.ts'
import { JoinJobPanel } from '../components/JoinJobPanel.tsx'

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
          <h2>Server Details</h2>
          <Link className="button" to="/servers">
            Back to browser
          </Link>
        </div>
        {detailsQuery.isLoading ? <div className="empty">Loading server details.</div> : null}
        {detailsQuery.error ? <div className="empty">Could not resolve the selected server.</div> : null}
        {details ? (
          <div className="stack">
            <div className="details-grid">
              <div className="detail-item">
                <div className="muted">Server</div>
                <div>{details.server.displayName}</div>
              </div>
              <div className="detail-item">
                <div className="muted">Endpoint</div>
                <div>{details.server.endpoint}</div>
              </div>
              <div className="detail-item">
                <div className="muted">Players</div>
                <div>
                  {details.server.players}/{details.server.maxPlayers}
                </div>
              </div>
              <div className="detail-item">
                <div className="muted">Map</div>
                <div>{details.server.map}</div>
              </div>
            </div>
            <div className="stack">
              <div className="card-title">
                <h3>Providers</h3>
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
              <div className="card-title">
                <h3>Required Mods</h3>
              </div>
              {details.requiredMods.length === 0 ? (
                <div className="empty">No required workshop mods were published by the current providers.</div>
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
                {details.warnings.map((warning) => (
                  <div className="badge badge-warn" key={warning}>
                    {warning}
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </section>

      <section className="card">
        <div className="card-title">
          <h2>Join Flow</h2>
          <span className="badge">{settingsQuery.data?.launchMode ?? 'loading'}</span>
        </div>
        {joinRequest ? (
          <div className="stack">
            <div className="detail-item">
              <div className="muted">Default launch name</div>
              <div>{joinRequest.settings.defaultPlayerName || 'unset'}</div>
            </div>
            <div className="button-row">
              <button className="button" onClick={() => prepareMutation.mutate()} type="button">
                Prepare Join
              </button>
              <button className="button button-primary" onClick={() => launchMutation.mutate()} type="button">
                Launch Server
              </button>
            </div>
            {prepareMutation.data ? (
              <div className="stack">
                <div className="detail-item">
                  <div className="muted">Launch mode</div>
                  <div>{prepareMutation.data.launchMode}</div>
                </div>
                <div className="detail-item">
                  <div className="muted">Launch args</div>
                  <div>{prepareMutation.data.launchArgs.join(' ') || 'No launch arguments generated.'}</div>
                </div>
                {prepareMutation.data.blockingIssues.length > 0 ? (
                  <div className="stack">
                    {prepareMutation.data.blockingIssues.map((issue) => (
                      <div className="badge badge-bad" key={issue}>
                        {issue}
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
            <JoinJobPanel status={jobQuery.data ?? launchMutation.data} />
          </div>
        ) : (
          <div className="empty">The join request becomes available once settings and details finish loading.</div>
        )}
      </section>
    </div>
  )
}
