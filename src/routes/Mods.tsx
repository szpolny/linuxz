import { useQuery } from '@tanstack/react-query'
import { listDetectedMods } from '../lib/api.ts'

export function ModsRoute() {
  const modsQuery = useQuery({
    queryKey: ['detected-mods'],
    queryFn: listDetectedMods,
  })

  return (
    <section className="card">
      <div className="card-title">
        <h2>Installed Mods</h2>
        <span className="badge">{modsQuery.data?.length ?? 0}</span>
      </div>
      {modsQuery.isLoading ? <div className="empty">Reading appworkshop manifest and local workshop folders.</div> : null}
      {modsQuery.error ? <div className="empty">Could not inspect local workshop content.</div> : null}
      {modsQuery.data && modsQuery.data.length === 0 ? <div className="empty">No DayZ workshop mods were detected locally.</div> : null}
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
