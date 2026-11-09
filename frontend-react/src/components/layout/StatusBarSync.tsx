import { useEffect } from 'react'
import { useTheme } from 'next-themes'
import { Capacitor } from '@capacitor/core'
import { StatusBar, StatusBarStyle } from '@capacitor/status-bar'

/**
 * Pilote les icônes de la barre de statut Android selon le thème de l'APP.
 *
 * ATTENTION (piège Capacitor) : l'énumération désigne la COULEUR DU FOND, pas
 * celle du texte :
 *   - StatusBarStyle.Dark  = « Light text for dark backgrounds »  → fond SOMBRE
 *   - StatusBarStyle.Light = « Dark text for light backgrounds »  → fond CLAIR
 * D'où le mapping ci-dessous (l'inverse serait illisible : icônes claires sur
 * fond clair, icônes sombres sur fond sombre).
 *
 * La bande elle-même affiche le fond de l'app (edge-to-edge web, voir
 * MainActivity + App.tsx) : gris clair en light, noir en dark.
 */
export function StatusBarSync() {
  const { theme, resolvedTheme } = useTheme()
  // resolvedTheme suit le système en attendant que le stockage soit chargé.
  const effective = theme === 'system' || theme == null ? resolvedTheme : theme
  const dark = effective === 'dark'

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return
    StatusBar.setStyle({
      // App sombre → icônes/texte clairs ; app claire → icônes/texte sombres.
      style: dark ? StatusBarStyle.Dark : StatusBarStyle.Light,
    }).catch(() => {})
  }, [dark])

  return null
}
