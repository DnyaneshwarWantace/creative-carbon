'use client'

import * as React from 'react'
import { createContext, useContext } from 'react'
import { createLogger } from '@open-mercato/shared/lib/logger'
import { THEME_STORAGE_KEY } from './theme-init-script'

const logger = createLogger('ui').child({ component: 'ThemeProvider' })

export type Theme = 'light' | 'dark' | 'system'

type ThemeContextValue = {
  theme: Theme
  resolvedTheme: 'light' | 'dark'
  setTheme: (theme: Theme) => void
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined)

function getSystemTheme(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'light'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function getStoredTheme(): Theme {
  if (typeof window === 'undefined') return 'light'
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY)
    if (stored === 'light' || stored === 'dark' || stored === 'system') {
      return stored
    }
  } catch (error) {
    // localStorage may be unavailable in private browsing, iframes, or restricted contexts
    // Theme will default to light - this is expected graceful degradation
    if (process.env.NODE_ENV === 'development') {
      logger.warn('localStorage read failed', { err: error })
    }
  }
  return 'light'
}

function applyTheme(resolvedTheme: 'light' | 'dark') {
  const root = document.documentElement
  if (resolvedTheme === 'dark') {
    root.classList.add('dark')
  } else {
    root.classList.remove('dark')
  }
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Use lazy initializers so the correct theme is set on the FIRST render,
  // not after an effect — this prevents the brief flash back to light.
  const [theme, setThemeState] = React.useState<Theme>(() => {
    if (typeof window === 'undefined') return 'light'
    return getStoredTheme()
  })
  const [resolvedTheme, setResolvedTheme] = React.useState<'light' | 'dark'>(() => {
    if (typeof window === 'undefined') return 'light'
    const stored = getStoredTheme()
    if (stored === 'dark') return 'dark'
    if (stored === 'system') return getSystemTheme()
    return 'light'
  })

  // Apply theme class on first client render and whenever resolvedTheme changes
  React.useEffect(() => {
    applyTheme(resolvedTheme)
  }, [resolvedTheme])

  // On mount, sync from localStorage in case SSR defaulted to light
  React.useEffect(() => {
    const stored = getStoredTheme()
    const resolved = stored === 'dark' ? 'dark' : stored === 'system' ? getSystemTheme() : 'light'
    setThemeState(stored)
    setResolvedTheme(resolved)
    applyTheme(resolved)
  }, [])

  // Listen for system theme changes
  React.useEffect(() => {
    if (typeof window === 'undefined') return

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const handleChange = () => {
      if (theme === 'system') {
        const newResolved = getSystemTheme()
        setResolvedTheme(newResolved)
        applyTheme(newResolved)
      }
    }

    mediaQuery.addEventListener('change', handleChange)
    return () => mediaQuery.removeEventListener('change', handleChange)
  }, [theme])

  const setTheme = React.useCallback((newTheme: Theme) => {
    setThemeState(newTheme)
    try {
      localStorage.setItem(THEME_STORAGE_KEY, newTheme)
    } catch (error) {
      // localStorage may be unavailable - theme still works for this session, just won't persist
      if (process.env.NODE_ENV === 'development') {
        logger.warn('localStorage write failed', { err: error })
      }
    }
    const resolved = newTheme === 'system' ? getSystemTheme() : newTheme
    setResolvedTheme(resolved)
    applyTheme(resolved)
  }, [])

  const value = React.useMemo(
    () => ({ theme, resolvedTheme, setTheme }),
    [theme, resolvedTheme, setTheme]
  )

  // The element type rendered here must not depend on `mounted`. Swapping a
  // Fragment for the Provider once the first effect runs makes React unmount and
  // remount everything below this point, discarding the whole page's component
  // state. Flash of the wrong theme is prevented before first paint by
  // THEME_INIT_SCRIPT in the root layout, not by this branch.
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext)
  if (context === undefined) {
    // Return safe defaults when not in provider (e.g., server render)
    return {
      theme: 'system',
      resolvedTheme: 'light',
      setTheme: () => {},
    }
  }
  return context
}
