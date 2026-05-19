import { useEffect, useRef } from 'react'
import { useStore } from '../../../store/root.store'
import { loadLayout } from '../persistence.service'

export function useStartupRestore(): void {
  const settingsLoaded = useStore((s) => s.settingsLoaded)
  const resumeOnStartup = useStore((s) => s.settings.resumeOnStartup)
  const setPendingRestore = useStore((s) => s.setPendingRestore)
  const hasTriggered = useRef(false)

  useEffect(() => {
    if (!settingsLoaded || hasTriggered.current) return
    hasTriggered.current = true
    if (!resumeOnStartup) return
    loadLayout().then((layout) => {
      if (layout && layout.sessions.length > 0) {
        setPendingRestore(layout)
      }
    })
  }, [settingsLoaded, resumeOnStartup, setPendingRestore])
}
