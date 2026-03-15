import { useRef, type ReactNode } from 'react'
import { Pencil, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface SwipeableCardProps {
  children: ReactNode
  onSwipeLeft?: () => void
  onSwipeRight?: () => void
  leftLabel?: string
  rightLabel?: string
  className?: string
}

const THRESHOLD = 60
const MAX_SWIPE = 100

export function SwipeableCard({
  children,
  onSwipeLeft,
  onSwipeRight,
  leftLabel = 'Modifier',
  rightLabel = 'Supprimer',
  className,
}: SwipeableCardProps) {
  const foregroundRef = useRef<HTMLDivElement>(null)
  const startX = useRef(0)
  const startY = useRef(0)
  const currentOffset = useRef(0)
  const locked = useRef<'horizontal' | 'vertical' | null>(null)

  function handleTouchStart(e: React.TouchEvent) {
    startX.current = e.touches[0].clientX
    startY.current = e.touches[0].clientY
    currentOffset.current = 0
    locked.current = null
    if (foregroundRef.current) {
      foregroundRef.current.style.transition = 'none'
    }
  }

  function handleTouchMove(e: React.TouchEvent) {
    const deltaX = e.touches[0].clientX - startX.current
    const deltaY = e.touches[0].clientY - startY.current

    // Determine direction lock on first significant move
    if (locked.current === null && (Math.abs(deltaX) > 5 || Math.abs(deltaY) > 5)) {
      locked.current = Math.abs(deltaX) > Math.abs(deltaY) ? 'horizontal' : 'vertical'
    }

    if (locked.current !== 'horizontal') return

    // Prevent vertical scrolling while swiping horizontally
    e.preventDefault()

    const clamped = Math.max(-MAX_SWIPE, Math.min(MAX_SWIPE, deltaX))
    currentOffset.current = clamped
    if (foregroundRef.current) {
      foregroundRef.current.style.transform = `translateX(${clamped}px)`
    }
  }

  function handleTouchEnd() {
    const offset = currentOffset.current

    if (offset > THRESHOLD && onSwipeRight) {
      onSwipeRight()
    }
    if (offset < -THRESHOLD && onSwipeLeft) {
      onSwipeLeft()
    }

    // Spring back
    if (foregroundRef.current) {
      foregroundRef.current.style.transition = 'transform 200ms ease-out'
      foregroundRef.current.style.transform = 'translateX(0)'
    }
    currentOffset.current = 0
    locked.current = null
  }

  return (
    <div className={cn('relative overflow-hidden rounded-xl', className)}>
      {/* Action backgrounds — mobile only */}
      <div className="absolute inset-0 flex sm:hidden">
        {/* Right swipe → edit (left panel) */}
        <div className="flex w-1/2 items-center gap-2 bg-muted pl-4">
          <Pencil className="h-4 w-4 text-foreground" />
          <span className="text-sm font-medium">{leftLabel}</span>
        </div>
        {/* Left swipe → delete (right panel) */}
        <div className="flex w-1/2 items-center justify-end gap-2 bg-destructive pr-4">
          <span className="text-sm font-medium text-destructive-foreground">{rightLabel}</span>
          <Trash2 className="h-4 w-4 text-destructive-foreground" />
        </div>
      </div>

      {/* Foreground content */}
      <div
        ref={foregroundRef}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        className="relative z-10 bg-card"
      >
        {children}
      </div>
    </div>
  )
}
