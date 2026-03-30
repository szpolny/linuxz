import { type HTMLAttributes } from 'react'

export function Skeleton({ className = '', ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`skeleton ${className}`}
      style={{
        backgroundColor: 'rgba(255, 255, 255, 0.05)',
        borderRadius: '8px',
        animation: 'pulse 1.5s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        ...props.style,
      }}
      {...props}
    />
  )
}

export function ServerCardSkeleton() {
  return (
    <div className="server-row" style={{ pointerEvents: 'none', opacity: 0.6 }}>
      <div className="server-card-top">
        <div className="server-card-link">
          <div className="server-header">
            <div style={{ width: '100%' }}>
              <Skeleton style={{ height: '20px', width: '60%', marginBottom: '8px' }} />
              <Skeleton style={{ height: '14px', width: '30%', marginBottom: '8px' }} />
              <Skeleton style={{ height: '12px', width: '20%' }} />
            </div>
            <div className="button-row server-badge-row">
              <Skeleton style={{ height: '24px', width: '60px', borderRadius: '999px' }} />
              <Skeleton style={{ height: '24px', width: '80px', borderRadius: '999px' }} />
            </div>
          </div>
          <div className="pill-row">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} style={{ height: '28px', width: '80px', borderRadius: '8px' }} />
            ))}
          </div>
        </div>
        <Skeleton style={{ height: '40px', width: '40px', borderRadius: '12px' }} />
      </div>
    </div>
  )
}
