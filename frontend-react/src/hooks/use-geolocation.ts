import { useState, useCallback } from 'react'

interface GeolocationState {
  latitude: number | null
  longitude: number | null
  status: 'idle' | 'loading' | 'success' | 'error'
  error: string | null
}

export function useGeolocation() {
  const [state, setState] = useState<GeolocationState>({
    latitude: null,
    longitude: null,
    status: 'idle',
    error: null,
  })

  const capture = useCallback(() => {
    if (!navigator.geolocation) {
      setState((prev) => ({
        ...prev,
        status: 'error',
        error: 'La géolocalisation n\'est pas supportée par votre navigateur',
      }))
      return
    }

    setState((prev) => ({ ...prev, status: 'loading', error: null }))

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setState({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          status: 'success',
          error: null,
        })
      },
      (error) => {
        let message = 'Impossible d\'obtenir la position'
        if (error.code === error.PERMISSION_DENIED) {
          message = 'Permission de géolocalisation refusée'
        } else if (error.code === error.TIMEOUT) {
          message = 'Délai d\'attente dépassé'
        }
        setState((prev) => ({ ...prev, status: 'error', error: message }))
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    )
  }, [])

  const reset = useCallback(() => {
    setState({ latitude: null, longitude: null, status: 'idle', error: null })
  }, [])

  return { ...state, capture, reset }
}
