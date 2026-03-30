import { type InputHTMLAttributes } from 'react'
import { type LucideIcon } from 'lucide-react'

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  icon?: LucideIcon
  label?: string
  error?: string
}

export function Input({ icon: Icon, label, error, className = '', ...props }: InputProps) {
  return (
    <div className={`field ${className}`}>
      {label && <label htmlFor={props.id}>{label}</label>}
      <div style={{ position: 'relative' }}>
        <input
          {...props}
          style={{
            paddingLeft: Icon ? '38px' : '14px',
            ...props.style,
          }}
        />
        {Icon && (
          <Icon
            size={16}
            style={{
              position: 'absolute',
              left: '12px',
              top: '50%',
              transform: 'translateY(-50%)',
              opacity: 0.5,
              pointerEvents: 'none',
            }}
          />
        )}
      </div>
      {error && <span style={{ fontSize: '0.8rem', color: 'var(--bad)', marginTop: '4px' }}>{error}</span>}
    </div>
  )
}
