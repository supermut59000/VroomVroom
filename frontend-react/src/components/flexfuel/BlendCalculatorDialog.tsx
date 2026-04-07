import { FlaskConical } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useVehicle } from '@/hooks/use-vehicles'
import { useAllFuelEntries } from '@/hooks/use-fuel-entries'
import { useFlexfuelConversion } from '@/hooks/use-flexfuel'
import { BlendCalculator } from './BlendCalculator'

interface BlendCalculatorDialogProps {
  vehicleId: number | null
  onClose: () => void
}

export function BlendCalculatorDialog({ vehicleId, onClose }: BlendCalculatorDialogProps) {
  const { data: vehicle } = useVehicle(vehicleId)
  const { data: entries } = useAllFuelEntries(vehicleId)
  const { data: conversion } = useFlexfuelConversion(vehicleId)

  const open = vehicleId !== null

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FlaskConical className="h-5 w-5 text-emerald-600" />
            Mélange E85
            {vehicle && (
              <span className="text-sm font-normal text-muted-foreground">
                — {vehicle.brand} {vehicle.model}
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        {conversion && (
          <p className="text-xs text-muted-foreground -mt-2 mb-1">
            Cible {conversion.target_ethanol_pct}% &nbsp;· {vehicle?.tank_capacity ?? '?'} L
          </p>
        )}

        {!conversion ? (
          <p className="py-4 text-sm text-muted-foreground">
            Aucune conversion FlexFuel enregistrée pour ce véhicule.
          </p>
        ) : vehicle && entries ? (
          <BlendCalculator
            conversion={conversion}
            vehicle={vehicle}
            entries={entries}
            embedded
          />
        ) : (
          <p className="py-4 text-sm text-muted-foreground">Chargement…</p>
        )}
      </DialogContent>
    </Dialog>
  )
}
