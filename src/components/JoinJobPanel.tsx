import type { JoinJobStatus } from '../lib/contracts.ts'
import { Loader2, CheckCircle2, AlertCircle, PlayCircle, Info } from 'lucide-react'

type JoinJobPanelProps = {
  status: JoinJobStatus | undefined
}

function getPhaseIcon(phase: string) {
  switch (phase) {
    case 'pending':
    case 'downloading':
    case 'verifying':
      return <Loader2 size={18} className="stat-icon animate-spin" />
    case 'complete':
      return <CheckCircle2 size={18} style={{ color: 'var(--good)' }} />
    case 'blocked':
      return <AlertCircle size={18} style={{ color: 'var(--bad)' }} />
    case 'launching':
      return <PlayCircle size={18} className="stat-icon" />
    default:
      return <Info size={18} className="stat-icon" />
  }
}

export function JoinJobPanel({ status }: JoinJobPanelProps) {
  if (!status) {
    return null
  }

  const isBlocked = status.phase === 'blocked'
  const isComplete = status.phase === 'complete'

  return (
    <section className="job-panel">
      <div className="card-title" style={{ marginBottom: '12px' }}>
        <h3 style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {getPhaseIcon(status.phase)} Join Progress
        </h3>
        <span className={`badge ${isBlocked ? 'badge-bad' : isComplete ? 'badge-good' : ''}`}>
          {status.phase.toUpperCase()}
        </span>
      </div>
      
      <div className="progress" aria-label="Join progress">
        <span 
          style={{ 
            width: `${Math.max(0, Math.min(status.progress * 100, 100))}%`,
            background: isBlocked ? 'var(--bad)' : isComplete ? 'var(--good)' : 'var(--accent)'
          }} 
        />
      </div>

      <div style={{ fontSize: '0.9rem', color: isBlocked ? 'var(--bad)' : 'var(--text)' }}>
        {status.message}
      </div>

      {status.launchResult ? (
        <div className="muted" style={{ padding: '8px', background: 'rgba(255,255,255,0.03)', borderRadius: '6px', fontSize: '0.8rem' }}>
          {status.launchResult}
        </div>
      ) : null}

      {status.warnings.length > 0 ? (
        <div className="stack" style={{ marginTop: '4px' }}>
          {status.warnings.map((warning) => (
            <div className="badge badge-warn" key={warning} style={{ width: '100%', justifyContent: 'flex-start' }}>
              <AlertCircle size={12} /> {warning}
            </div>
          ))}
        </div>
      ) : null}

      <div className="details-grid" style={{ marginTop: '8px' }}>
        <div className="detail-item" style={{ padding: '10px' }}>
          <div className="muted" style={{ fontSize: '0.7rem' }}>Installed Mods</div>
          <div style={{ fontWeight: 600 }}>{status.installedMods.length}</div>
        </div>
        <div className="detail-item" style={{ padding: '10px' }}>
          <div className="muted" style={{ fontSize: '0.7rem' }}>Missing Mods</div>
          <div style={{ fontWeight: 600 }}>{status.missingMods.length}</div>
        </div>
        <div className="detail-item" style={{ padding: '10px' }}>
          <div className="muted" style={{ fontSize: '0.7rem' }}>Status</div>
          <div style={{ fontWeight: 600, color: status.readyToLaunch ? 'var(--good)' : 'var(--text-muted)' }}>
            {status.readyToLaunch ? 'Ready' : 'Waiting'}
          </div>
        </div>
      </div>
    </section>
  )
}
