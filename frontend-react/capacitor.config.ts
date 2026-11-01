import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'fr.ouiouibaguette.vroomvroom',
  appName: 'VroomVroom',
  webDir: 'dist',
  server: {
    // https scheme in the WebView: required for the PWA service worker and
    // geolocation prompts to behave like a browser.
    androidScheme: 'https',
  },
}

export default config
