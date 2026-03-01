export type ThemePreference = 'light' | 'dark' | 'system'
export type ResolvedTheme = 'light' | 'dark'

const THEME_ORDER: ThemePreference[] = ['system', 'light', 'dark']

export function getNextTheme(theme: ThemePreference): ThemePreference {
  const currentIndex = THEME_ORDER.indexOf(theme)
  if (currentIndex === -1) return 'system'
  return THEME_ORDER[(currentIndex + 1) % THEME_ORDER.length]
}

export function resolveTheme(theme: ThemePreference, isSystemDark: boolean): ResolvedTheme {
  if (theme === 'system') {
    return isSystemDark ? 'dark' : 'light'
  }
  return theme
}
