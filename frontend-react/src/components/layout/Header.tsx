import { useState } from 'react'
import { Car, Sun, Moon, Fuel, Route } from 'lucide-react'
import { useTheme } from 'next-themes'
import { Button } from '@/components/ui/button'
import { StationPricesDialog } from '@/components/fuel/StationPricesDialog'
import { RouteStationDialog } from '@/components/fuel/RouteStationDialog'

export function Header() {
  const { theme, setTheme } = useTheme()
  const [stationPricesOpen, setStationPricesOpen] = useState(false)
  const [routeStationOpen, setRouteStationOpen] = useState(false)

  const toggleTheme = () => {
    setTheme(theme === 'dark' ? 'light' : 'dark')
  }

  return (
    <>
      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto flex h-14 items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <Car className="h-6 w-6 text-primary" />
            <h1 className="text-xl font-bold tracking-tight">VroomVroom</h1>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setRouteStationOpen(true)}
              title="Station la moins chère sur l'itinéraire"
            >
              <Route className="h-5 w-5" />
              <span className="sr-only">Station sur l'itinéraire</span>
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setStationPricesOpen(true)}
              title="Prix des stations proches"
            >
              <Fuel className="h-5 w-5" />
              <span className="sr-only">Prix des stations</span>
            </Button>
            <Button variant="ghost" size="icon" onClick={toggleTheme} title="Changer le thème">
              <Sun className="h-5 w-5 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
              <Moon className="absolute h-5 w-5 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
              <span className="sr-only">Changer le thème</span>
            </Button>
          </div>
        </div>
      </header>

      <StationPricesDialog
        open={stationPricesOpen}
        onClose={() => setStationPricesOpen(false)}
      />
      <RouteStationDialog
        open={routeStationOpen}
        onClose={() => setRouteStationOpen(false)}
      />
    </>
  )
}
