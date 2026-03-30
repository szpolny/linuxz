import type { JoinJobStatus } from '../lib/contracts.ts'

type JoinJobPanelProps = {
  status: JoinJobStatus | undefined
}

export function JoinJobPanel({ status }: JoinJobPanelProps) {
  if (!status) {
    return null
  }

  return (
    <section className="job-panel">
      <div className="card-title">
        <h3>Join Job</h3>
        <span className="badge">{status.phase}</span>
      </div>
      <div className="progress" aria-label="Join progress">
        <span style={{ width: `${Math.max(0, Math.min(status.progress * 100, 100))}%` }} />
      </div>
      <div>{status.message}</div>
      {status.launchResult ? <div className="muted">{status.launchResult}</div> : null}
      {status.warnings.length > 0 ? (
        <div className="stack">
          {status.warnings.map((warning) => (
            <div className="badge badge-warn" key={warning}>
              {warning}
            </div>
          ))}
        </div>
      ) : null}
      <div className="details-grid">
        <div className="detail-item">
          <div className="muted">Installed Mods</div>
          <div>{status.installedMods.length}</div>
        </div>
        <div className="detail-item">
          <div className="muted">Missing Mods</div>
          <div>{status.missingMods.length}</div>
        </div>
        <div className="detail-item">
          <div className="muted">Ready To Launch</div>
          <div>{status.readyToLaunch ? 'Yes' : 'Not yet'}</div>
        </div>
      </div>
    </section>
  )
}
