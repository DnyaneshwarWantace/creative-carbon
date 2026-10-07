"use client"

import * as React from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@open-mercato/shared/lib/utils'

export interface UseDragScrollOptions {
  /** Multiplier for drag speed (default: 1.2) */
  multiplier?: number
  /** Amount in px to scroll when clicking the left/right buttons (default: 320) */
  step?: number
  /** Whether to convert vertical mouse wheel to horizontal scroll (default: false) */
  wheelToScroll?: boolean
}

export function useDragScroll<T extends HTMLElement = HTMLDivElement>(options: UseDragScrollOptions = {}) {
  const { multiplier = 1.2, step = 320, wheelToScroll = false } = options
  const ref = React.useRef<T | null>(null)
  const [isDragging, setIsDragging] = React.useState(false)
  const [canScrollLeft, setCanScrollLeft] = React.useState(false)
  const [canScrollRight, setCanScrollRight] = React.useState(false)
  const holdIntervalRef = React.useRef<NodeJS.Timeout | null>(null)

  const checkScroll = React.useCallback(() => {
    const el = ref.current
    if (!el) return
    const maxScroll = el.scrollWidth - el.clientWidth
    setCanScrollLeft(el.scrollLeft > 2)
    setCanScrollRight(maxScroll > 2 && el.scrollLeft < maxScroll - 2)
  }, [])

  React.useEffect(() => {
    const el = ref.current
    if (!el) return

    checkScroll()
    const onScroll = () => checkScroll()
    el.addEventListener('scroll', onScroll, { passive: true })

    let resizeObserver: ResizeObserver | null = null
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => checkScroll())
      resizeObserver.observe(el)
      if (el.firstElementChild) {
        resizeObserver.observe(el.firstElementChild)
      }
    }

    const onWheel = (e: WheelEvent) => {
      if (!wheelToScroll) return
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX) && el.scrollWidth > el.clientWidth) {
        el.scrollLeft += e.deltaY
        e.preventDefault()
      }
    }

    if (wheelToScroll) {
      el.addEventListener('wheel', onWheel, { passive: false })
    }

    return () => {
      el.removeEventListener('scroll', onScroll)
      if (wheelToScroll) el.removeEventListener('wheel', onWheel)
      resizeObserver?.disconnect()
    }
  }, [checkScroll, wheelToScroll])

  const onMouseDown = React.useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return // Left button only
    const el = ref.current
    if (!el) return

    const target = e.target as HTMLElement
    // Ignore direct clicks on interactive elements unless user drags
    if (target.closest('input, textarea, select, [contenteditable="true"]')) {
      return
    }

    let isDown = true
    let hasDragged = false
    const startX = e.pageX - el.offsetLeft
    const initialScroll = el.scrollLeft

    setIsDragging(true)

    const onMouseMove = (moveEvent: MouseEvent) => {
      if (!isDown) return
      const currentX = moveEvent.pageX - el.offsetLeft
      const walk = (currentX - startX) * multiplier
      if (Math.abs(walk) > 4) {
        hasDragged = true
      }
      el.scrollLeft = initialScroll - walk
    }

    const onMouseUp = () => {
      isDown = false
      setIsDragging(false)
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)

      if (hasDragged) {
        // Prevent accidental trigger of clicks/links after dragging
        const captureClick = (clickEvent: MouseEvent) => {
          clickEvent.stopPropagation()
          clickEvent.preventDefault()
          window.removeEventListener('click', captureClick, true)
        }
        window.addEventListener('click', captureClick, true)
      }
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }, [multiplier])

  const scrollByAmount = React.useCallback((amount: number) => {
    const el = ref.current
    if (!el) return
    el.scrollBy({ left: amount, behavior: 'smooth' })
  }, [])

  const startHoldScroll = React.useCallback((direction: 'left' | 'right') => {
    const amount = direction === 'left' ? -25 : 25
    const el = ref.current
    if (!el) return
    el.scrollLeft += amount * 2
    if (holdIntervalRef.current) clearInterval(holdIntervalRef.current)
    holdIntervalRef.current = setInterval(() => {
      if (ref.current) {
        ref.current.scrollLeft += amount
      }
    }, 20)
  }, [])

  const stopHoldScroll = React.useCallback(() => {
    if (holdIntervalRef.current) {
      clearInterval(holdIntervalRef.current)
      holdIntervalRef.current = null
    }
  }, [])

  const scrollLeft = React.useCallback(() => scrollByAmount(-step), [scrollByAmount, step])
  const scrollRight = React.useCallback(() => scrollByAmount(step), [scrollByAmount, step])

  return {
    ref,
    isDragging,
    canScrollLeft,
    canScrollRight,
    scrollLeft,
    scrollRight,
    startHoldScroll,
    stopHoldScroll,
    checkScroll,
    events: {
      onMouseDown,
    },
  }
}

export interface HorizontalScrollProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode
  className?: string
  innerClassName?: string
  showButtons?: boolean
  showGradients?: boolean
  step?: number
  wheelToScroll?: boolean
  buttonVariant?: 'floating' | 'inline'
}

export const HorizontalScroll = React.forwardRef<HTMLDivElement, HorizontalScrollProps>(
  (
    {
      children,
      className,
      innerClassName,
      showButtons = true,
      showGradients = true,
      step = 320,
      wheelToScroll = false,
      buttonVariant = 'floating',
      ...props
    },
    forwardedRef,
  ) => {
    const {
      ref: localRef,
      isDragging,
      canScrollLeft,
      canScrollRight,
      scrollLeft,
      scrollRight,
      startHoldScroll,
      stopHoldScroll,
      events,
    } = useDragScroll<HTMLDivElement>({ step, wheelToScroll })

    // Merge forwarded ref if provided
    React.useImperativeHandle(forwardedRef, () => localRef.current!)

    return (
      <div className={cn('group/hscroll relative min-w-0 w-full select-none', className)} {...props}>
        {/* Left Gradient Indicator */}
        {showGradients && canScrollLeft && (
          <div
            className="pointer-events-none absolute left-0 top-0 bottom-0 z-10 w-8 bg-gradient-to-r from-background/90 to-transparent transition-opacity"
            aria-hidden="true"
          />
        )}

        {/* Left Scroll Button */}
        {showButtons && canScrollLeft && (
          <button
            type="button"
            aria-label="Scroll left"
            onClick={scrollLeft}
            onMouseDown={() => startHoldScroll('left')}
            onMouseUp={stopHoldScroll}
            onMouseLeave={stopHoldScroll}
            className={cn(
              'absolute left-2 top-1/2 -translate-y-1/2 z-20 flex h-8 w-8 items-center justify-center rounded-full border border-border/80 bg-background/95 text-foreground shadow-md backdrop-blur-xs transition-all hover:bg-muted hover:scale-105 active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary',
              buttonVariant === 'floating' && 'opacity-80 hover:opacity-100 group-hover/hscroll:opacity-100',
            )}
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        )}

        {/* Scrollable Container */}
        <div
          ref={localRef}
          {...events}
          className={cn(
            'overflow-x-auto no-scrollbar scroll-smooth cursor-grab active:cursor-grabbing',
            isDragging && 'select-none cursor-grabbing scroll-auto',
            innerClassName,
          )}
          style={{
            scrollbarWidth: 'none',
            msOverflowStyle: 'none',
          }}
        >
          {children}
        </div>

        {/* Right Scroll Button */}
        {showButtons && canScrollRight && (
          <button
            type="button"
            aria-label="Scroll right"
            onClick={scrollRight}
            onMouseDown={() => startHoldScroll('right')}
            onMouseUp={stopHoldScroll}
            onMouseLeave={stopHoldScroll}
            className={cn(
              'absolute right-2 top-1/2 -translate-y-1/2 z-20 flex h-8 w-8 items-center justify-center rounded-full border border-border/80 bg-background/95 text-foreground shadow-md backdrop-blur-xs transition-all hover:bg-muted hover:scale-105 active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary',
              buttonVariant === 'floating' && 'opacity-80 hover:opacity-100 group-hover/hscroll:opacity-100',
            )}
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        )}

        {/* Right Gradient Indicator */}
        {showGradients && canScrollRight && (
          <div
            className="pointer-events-none absolute right-0 top-0 bottom-0 z-10 w-8 bg-gradient-to-l from-background/90 to-transparent transition-opacity"
            aria-hidden="true"
          />
        )}
      </div>
    )
  },
)

HorizontalScroll.displayName = 'HorizontalScroll'
