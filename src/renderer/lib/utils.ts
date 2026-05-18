import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}

export function normalizePath(p: string): string {
  return p.replace(/\\/g, '/')
}

export function shortPath(p: string): string {
  const parts = normalizePath(p).split('/').filter(Boolean)
  if (parts.length <= 2) return normalizePath(p)
  return `…/${parts.slice(-2).join('/')}`
}

/**
 * Returns '#000000' or '#ffffff' — whichever has better contrast against the given RGB color.
 * Uses WCAG relative luminance formula.
 */
export function contrastColor(r: number, g: number, b: number): string {
  const toLinear = (c: number): number => {
    const s = c / 255
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  }
  const L = 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b)
  return L > 0.179 ? '#000000' : '#ffffff'
}

/**
 * Reads --brand-accent from the document's computed style and returns the appropriate
 * contrast text color ('#000000' or '#ffffff').
 */
export function accentContrastColor(): string {
  if (typeof document === 'undefined') return '#ffffff'
  const val = getComputedStyle(document.documentElement).getPropertyValue('--brand-accent').trim()
  const [r, g, b] = val.split(' ').map(Number)
  if (r === undefined || isNaN(r)) return '#ffffff'
  return contrastColor(r, g, b)
}
