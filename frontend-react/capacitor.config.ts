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
  android: {
    // Geolocation (station search, fill GPS capture) — the WebView only
    // prompts for permissions declared here.
    permissions: [
      'android.permission.ACCESS_COARSE_LOCATION',
      'android.permission.ACCESS_FINE_LOCATION',
    ],
  },
}

export default config
