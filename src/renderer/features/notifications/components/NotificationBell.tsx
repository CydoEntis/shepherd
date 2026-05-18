import { useState, useEffect, useRef } from 'react'
import { Bell, Check, X, ChevronRight, Sparkles } from 'lucide-react'
import { useStore } from '../../../store/root.store'
import { cn, accentContrastColor } from '../../../lib/utils'
import type { AppNotification } from '../notifications.store'

function relativeTime(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

function NotificationItem({ n, onAction, onDismiss }: {
  n: AppNotification
  onAction: () => void
  onDismiss: () => void
}): JSX.Element {
  return (
    <div className={cn(
      'flex items-start gap-2.5 px-3 py-2.5 group transition-colors',
      n.read ? 'opacity-50' : 'bg-brand-panel/30'
    )}>
      <div className="mt-0.5 shrink-0">
        {n.type === 'agent-done'
          ? <div className="w-2 h-2 rounded-full bg-emerald-400 mt-1" />
          : n.type === 'agent-waiting'
          ? <div className="w-2 h-2 rounded-full bg-amber-400 mt-1" />
          : <Sparkles size={13} className="text-brand-accent" />
        }
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[12px] text-zinc-200 leading-snug truncate">{n.title}</p>
        <p className="text-[10px] text-zinc-500 mt-0.5">{relativeTime(n.createdAt)}</p>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <button
          onClick={onAction}
          className="flex items-center gap-0.5 text-[10px] font-medium text-brand-accent hover:text-brand-accent/80 transition-colors"
        >
          {n.type === 'agent-done' ? 'Switch' : 'View'}
          <ChevronRight size={10} />
        </button>
        <button
          onClick={onDismiss}
          className="opacity-0 group-hover:opacity-100 transition-opacity text-zinc-500 hover:text-zinc-300 p-0.5"
        >
          <X size={11} />
        </button>
      </div>
    </div>
  )
}

export function NotificationBell(): JSX.Element {
  const notifications = useStore((s) => s.notifications)
  const markNotificationRead = useStore((s) => s.markNotificationRead)
  const markAllNotificationsRead = useStore((s) => s.markAllNotificationsRead)
  const removeNotification = useStore((s) => s.removeNotification)
  const setActiveSession = useStore((s) => s.setActiveSession)

  const unread = notifications.filter((n) => !n.read).length
  // Re-evaluate when theme changes so CSS var is read fresh
  useStore((s) => s.settings.theme)
  const badgeTextColor = accentContrastColor()
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent): void => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const handleAction = (n: AppNotification): void => {
    markNotificationRead(n.id)
    if (n.type === 'agent-done' && n.tabId) {
      setActiveSession(n.tabId)
    } else if (n.type === 'release-notes') {
      document.dispatchEvent(new CustomEvent('acc:open-release-notes'))
    }
    setOpen(false)
  }

  const handleDismiss = (id: string): void => {
    removeNotification(id)
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        title="Notifications"
        className={cn(
          'relative flex items-center gap-1.5 px-2.5 h-7 rounded transition-colors',
          open ? 'text-brand-muted bg-brand-panel' : 'text-zinc-500 hover:text-zinc-300'
        )}
      >
        <Bell size={15} />
        {unread > 0 && (
          <span className="absolute top-0.5 right-1 min-w-[14px] h-[14px] px-0.5 flex items-center justify-center rounded-full bg-brand-accent text-[9px] font-bold leading-none" style={{ color: badgeTextColor }}>
            {unread > 9 ? '9+' : unread}
          </span>
        )}
        <span className="text-[11px] font-medium">Notifications</span>
      </button>

      {open && (
        <div className="absolute bottom-full right-0 mb-2 w-80 bg-brand-surface border border-brand-panel/60 rounded-xl shadow-2xl overflow-hidden z-50">
          <div className="flex items-center justify-between px-3 py-2 border-b border-brand-panel/40">
            <span className="text-[11px] font-semibold text-zinc-300">Notifications</span>
            {unread > 0 && (
              <button
                onClick={markAllNotificationsRead}
                className="flex items-center gap-1 text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                <Check size={11} />
                Mark all read
              </button>
            )}
          </div>

          {notifications.length === 0 ? (
            <div className="px-3 py-6 text-center">
              <Bell size={20} className="mx-auto mb-2 text-zinc-600" />
              <p className="text-[11px] text-zinc-500">No notifications</p>
            </div>
          ) : (
            <div className="max-h-80 overflow-y-auto divide-y divide-brand-panel/30">
              {notifications.map((n) => (
                <NotificationItem
                  key={n.id}
                  n={n}
                  onAction={() => handleAction(n)}
                  onDismiss={() => handleDismiss(n.id)}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
