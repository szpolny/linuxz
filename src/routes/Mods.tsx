import { useQuery } from '@tanstack/react-query'
import { listDetectedMods } from '../lib/api.ts'
import { Package, Download, ServerOff } from 'lucide-react'
import { Skeleton } from '../components/ui/Skeleton.tsx'
import { EmptyState } from '../components/ui/EmptyState.tsx'

export function ModsRoute() {
  const modsQuery = useQuery({
    queryKey: ['detected-mods'],
    queryFn: listDetectedMods,
  })

  return (
    <section className="card">
      <div className="card-title">
        <h2><Package size={20} className="stat-icon" /> Installed Mods</h2>
        <span className="badge">{modsQuery.isLoading ? '...' : (modsQuery.data?.length ?? 0)} Total</span>
      </div>
      {modsQuery.isLoading ? (
        <div className="mod-list">
           {[1, 2, 3, 4, 5, 6].map(i => (
             <div key={i} className="mod-row">
               <div style={{ width: '100%' }}>
                 <Skeleton style={{ height: '16px', width: '30%', marginBottom: '8px' }} />
                 <Skeleton style={{ height: '12px', width: '15%' }} />
               </div>
               <Skeleton style={{ height: '24px', width: '60px', borderRadius: '999px' }} />
             </div>
           ))}
        </div>
      ) : null}
      {modsQuery.error ? (
        <EmptyState 
          icon={ServerOff} 
          description="Could not inspect local workshop content." 
        />
      ) : null}
      {modsQuery.data && modsQuery.data.length === 0 ? (
        <EmptyState 
          icon={Download} 
          description="No DayZ workshop mods were detected locally." 
        />
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
