import { useEffect } from 'react'
import { useTheme } from 'next-themes'
import { Capacitor } from '@capacitor/core'
import { StatusBar, StatusBarStyle } from '@capacitor/status-bar'

// Couleurs identiques au --background de l'app (src/index.css) :
// light = oklch(0.95 0 0) ≈ #EEEEEE, dark = oklch(0.145 0 0) ≈ #252525.
const LIGHT_BG = '#EEEEEE'
const DARK_BG = '#252525'

/**
 * Pilote la barre de statut Android selon le thème de l'APP (et non du système) :
 * - icônes sombres sur fond clair (light), icônes claires sur fond sombre (dark)
 * - couleur de fond = le fond de l'app (utile < Android 15 ; sur 15+ l'app se
 *   dessine edge-to-edge derrière la barre de statut de toute façon)
 *
 * À rendre dans un enfant de <ThemeProvider>.
 */
export function StatusBarSync() {
  const { theme, resolvedTheme } = useTheme()
  // resolvedTheme suit le système en attendant que le stockage soit chargé.
  const effective = theme === 'system' || theme == null ? resolvedTheme : theme
  const dark = effective === 'dark'

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return
    StatusBar.setStyle({
      style: dark ? StatusBarStyle.Light : StatusBarStyle.Dark,
    }).catch(() => {})
    StatusBar.setBackgroundColor({ color: dark ? DARK_BG : LIGHT_BG }).catch(() => {})
  }, [dark])

  return null
}
