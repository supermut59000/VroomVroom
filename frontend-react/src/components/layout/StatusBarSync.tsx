import { useEffect } from 'react'
import { useTheme } from 'next-themes'
import { Capacitor } from '@capacitor/core'
import { StatusBar, StatusBarStyle } from '@capacitor/status-bar'

// Couleurs identiques au --background de l'app (src/index.css) :
// light = #BDBDBD (gris moyen), dark = #252525.
const LIGHT_BG = '#BDBDBD'
const DARK_BG = '#252525'

/**
 * Pilote la barre de statut Android selon le thème de l'APP (et non du système) :
 * - horloge/icônes TOUJOURS BLANCHES (choix utilisateur) : lisibles sur le gris
 *   moyen en light comme sur le noir en dark
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
    // Icônes blanches dans les deux modes (le gris light est assez sombre
    // pour rester lisible ; le noir dark aussi).
    StatusBar.setStyle({ style: StatusBarStyle.Light }).catch(() => {})
    StatusBar.setBackgroundColor({ color: dark ? DARK_BG : LIGHT_BG }).catch(() => {})
  }, [dark])

  return null
}
