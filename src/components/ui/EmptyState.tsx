import { type ReactNode } from 'react'
import { type LucideIcon } from 'lucide-react'

type EmptyStateProps = {
  icon?: LucideIcon
  title?: string
  description: string
  action?: ReactNode
  className?: string
}

export function EmptyState({ icon: Icon, title, description, action, className = '' }: EmptyStateProps) {
  return (
    <div className={`empty ${className}`}>
      {Icon && <Icon size={48} className="stat-icon" style={{ marginBottom: '8px', opacity: 0.3 }} />}
      {title && <h3 style={{ margin: '0 0 4px', fontSize: '1.1rem' }}>{title}</h3>}
      <p style={{ margin: 0, opacity: 0.8, maxWidth: '32ch', lineHeight: 1.5 }}>{description}</p>
      {action && <div style={{ marginTop: '16px' }}>{action}</div>}
    </div>
  )
}
