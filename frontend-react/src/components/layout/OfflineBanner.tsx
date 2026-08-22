import { WifiOff } from 'lucide-react'
import { useOffline } from '@/hooks/use-offline'

export function OfflineBanner() {
  const { isOnline, queue } = useOffline()

  if (isOnline && queue.length === 0) return null

  return (
    <div className="space-y-0">
      {!isOnline && (
        <div className="flex items-center justify-center gap-2 bg-orange-500 px-4 py-2 text-sm font-medium text-white">
          <WifiOff className="h-4 w-4" />
          Mode hors-ligne — Les modifications seront synchronisées au retour de la connexion
        </div>
      )}
      {queue.length > 0 && (
        <div className="flex items-center justify-center gap-2 bg-purple-600 px-4 py-2 text-sm font-medium text-white">
          {queue.length} élément{queue.length > 1 ? 's' : ''} en attente de synchronisation
        </div>
      )}
    </div>
  )
}
