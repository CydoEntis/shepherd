import { useLayoutEffect } from 'react'

const EXTRA_THEMES = ['space', 'nebula', 'solar', 'aurora', 'mars', 'pulsar', 'cosmos', 'void'] as const

export function useTheme(appTheme: string): void {
  useLayoutEffect(() => {
    const html = document.documentElement
    const applyTheme = (): void => {
      const isDark =
        appTheme === 'dark' ||
        EXTRA_THEMES.includes(appTheme as typeof EXTRA_THEMES[number]) ||
        (appTheme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
      html.classList.toggle('dark', isDark)
      for (const t of EXTRA_THEMES) html.classList.toggle(t, appTheme === t)
    }
    applyTheme()
    if (appTheme === 'system') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)')
      mq.addEventListener('change', applyTheme)
      return () => mq.removeEventListener('change', applyTheme)
    }
    return undefined
  }, [appTheme])
}
