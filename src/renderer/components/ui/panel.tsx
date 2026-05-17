import * as React from 'react'
import { cn } from '../../lib/utils'

export interface PanelProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'inset' | 'floating'
}

const Panel = React.forwardRef<HTMLDivElement, PanelProps>(
  ({ className, variant = 'default', ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'rounded-xl border border-brand-panel/60 bg-brand-surface',
        variant === 'floating' && 'shadow-xl shadow-black/40',
        variant === 'inset' && 'bg-brand-bg/60 border-brand-panel/30',
        className
      )}
      {...props}
    />
  )
)
Panel.displayName = 'Panel'

export { Panel }
