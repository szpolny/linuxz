import { useQuery } from '@tanstack/react-query'
import { listDetectedMods } from '../lib/api.ts'
import { Package, Search, Download } from 'lucide-react'

export function ModsRoute() {
  const modsQuery = useQuery({
    queryKey: ['detected-mods'],
    queryFn: listDetectedMods,
  })

  return (
    <section className="card">
      <div className="card-title">
        <h2><Package size={20} className="stat-icon" /> Installed Mods</h2>
        <span className="badge">{modsQuery.data?.length ?? 0} Total</span>
      </div>
      {modsQuery.isLoading ? (
        <div className="empty">
          <Search size={32} className="animate-pulse" />
          Reading appworkshop manifest and local folders...
        </div>
      ) : null}
      {modsQuery.error ? (
        <div className="empty">
          <Package size={32} style={{ color: 'var(--bad)' }} />
          Could not inspect local workshop content.
        </div>
      ) : null}
      {modsQuery.data && modsQuery.data.length === 0 ? (
        <div className="empty">
          <Download size={32} />
          No DayZ workshop mods were detected locally.
        </div>
      ) : null}
      {modsQuery.data ? (
        <div className="mod-list">
          {modsQuery.data.map((mod) => (
            <div className="mod-row" key={mod.workshopId}>
              <div>
                <strong>{mod.displayName}</strong>
                <div className="muted">{mod.workshopId}</div>
              </div>
              <span className="badge badge-good">{mod.installedState}</span>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  )
}
