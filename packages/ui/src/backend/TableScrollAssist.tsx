"use client"

import * as React from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { IconButton } from '../primitives/icon-button'

const ATTRIBUTE = 'data-table-scroll'
const SELECTOR = `[${ATTRIBUTE}="on"]`
const DRAG_THRESHOLD = 5
const HOLD_STEP = 18
const BUTTON_STEP = 320
const HOLD_DELAY = 300
const MIN_VISIBLE_HEIGHT = 120
const BAR_GAP = 12

const SKIP_DRAG_SELECTOR = [
  'input',
  'textarea',
  'select',
  'option',
  '[role="checkbox"]',
  '[role="combobox"]',
  '[role="switch"]',
  '[role="slider"]',
  '[role="menuitem"]',
  '[contenteditable="true"]',
  '[contenteditable=""]',
  '[draggable="true"]',
  '[data-no-drag-scroll]',
].join(',')

const STYLE = `
${SELECTOR} { cursor: grab; scrollbar-width: auto; scrollbar-color: var(--muted-foreground) var(--muted); }
${SELECTOR}::-webkit-scrollbar { height: 12px; width: 12px; }
${SELECTOR}::-webkit-scrollbar-track { background: var(--muted); }
${SELECTOR}::-webkit-scrollbar-thumb { background: var(--muted-foreground); border-radius: 9999px; border: 3px solid var(--muted); }
${SELECTOR}::-webkit-scrollbar-corner { background: var(--muted); }
html[data-table-dragging] , html[data-table-dragging] * { cursor: grabbing !important; user-select: none !important; }
`

function scrollContainerOf(element: Element, boundary: Element): HTMLElement | null {
  let node = element.parentElement
  while (node && node !== boundary) {
    const overflowX = getComputedStyle(node).overflowX
    if (overflowX === 'auto' || overflowX === 'scroll') return node
    node = node.parentElement
  }
  return null
}

function ownsDragScroll(element: HTMLElement): boolean {
  return Boolean(element.closest('.group\\/hscroll'))
}

function tagContainers(root: Element) {
  const found = new Set<HTMLElement>()
  root.querySelectorAll('table, [data-drag-scroll]').forEach((element) => {
    const container = element.hasAttribute('data-drag-scroll') && element instanceof HTMLElement
      ? element
      : scrollContainerOf(element, root)
    if (container && !ownsDragScroll(container)) found.add(container)
  })
  root.querySelectorAll(`[${ATTRIBUTE}]`).forEach((element) => {
    if (!found.has(element as HTMLElement)) element.removeAttribute(ATTRIBUTE)
  })
  const containers: HTMLElement[] = []
  found.forEach((container) => {
    const overflows = container.scrollWidth > container.clientWidth + 1
    const value = overflows ? 'on' : 'off'
    if (container.getAttribute(ATTRIBUTE) !== value) container.setAttribute(ATTRIBUTE, value)
    if (overflows) containers.push(container)
  })
  return containers
}

function pickActive(containers: HTMLElement[]): HTMLElement | null {
  const viewportHeight = window.innerHeight
  let best: HTMLElement | null = null
  let bestVisible = 0
  for (const container of containers) {
    const rect = container.getBoundingClientRect()
    const visible = Math.min(rect.bottom, viewportHeight) - Math.max(rect.top, 0)
    if (visible < MIN_VISIBLE_HEIGHT) continue
    if (rect.bottom <= viewportHeight) continue
    if (visible > bestVisible) {
      best = container
      bestVisible = visible
    }
  }
  return best
}

type BarState = { left: number; width: number; thumbLeft: number; thumbWidth: number; canLeft: boolean; canRight: boolean }

export function TableScrollAssist({ rootSelector = 'main' }: { rootSelector?: string }) {
  const t = useT()
  const activeRef = React.useRef<HTMLElement | null>(null)
  const trackRef = React.useRef<HTMLDivElement | null>(null)
  const holdRef = React.useRef<number | null>(null)
  const frameRef = React.useRef<number | null>(null)
  const [bar, setBar] = React.useState<BarState | null>(null)

  const measure = React.useCallback(() => {
    frameRef.current = null
    const root = document.querySelector(rootSelector)
    if (!root) return
    const active = pickActive(tagContainers(root))
    activeRef.current = active
    if (!active) {
      setBar(null)
      return
    }
    const rect = active.getBoundingClientRect()
    const left = Math.max(rect.left, 0)
    const width = Math.min(rect.right, window.innerWidth) - left
    const trackWidth = Math.max(width - 88, 40)
    const ratio = active.clientWidth / active.scrollWidth
    const thumbWidth = Math.max(trackWidth * ratio, 32)
    const maxScroll = active.scrollWidth - active.clientWidth
    const thumbLeft = maxScroll > 0 ? (trackWidth - thumbWidth) * (active.scrollLeft / maxScroll) : 0
    setBar({
      left,
      width,
      thumbLeft,
      thumbWidth,
      canLeft: active.scrollLeft > 1,
      canRight: active.scrollLeft < maxScroll - 1,
    })
  }, [rootSelector])

  const schedule = React.useCallback(() => {
    if (frameRef.current !== null) return
    frameRef.current = window.requestAnimationFrame(measure)
  }, [measure])

  React.useEffect(() => {
    const root = document.querySelector(rootSelector)
    if (!root) return
    schedule()
    const observer = new MutationObserver(schedule)
    observer.observe(root, { childList: true, subtree: true })
    const resizeObserver = new ResizeObserver(schedule)
    resizeObserver.observe(root)
    window.addEventListener('resize', schedule)
    document.addEventListener('scroll', schedule, { capture: true, passive: true })
    return () => {
      observer.disconnect()
      resizeObserver.disconnect()
      window.removeEventListener('resize', schedule)
      document.removeEventListener('scroll', schedule, { capture: true })
      if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current)
    }
  }, [rootSelector, schedule])

  React.useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse' || event.button !== 0) return
      const target = event.target
      if (!(target instanceof Element)) return
      const container = target.closest<HTMLElement>(SELECTOR)
      if (!container) return
      if (target.closest(SKIP_DRAG_SELECTOR)) return
      const cursor = getComputedStyle(target).cursor
      if (cursor.includes('resize')) return

      const startX = event.clientX
      const startY = event.clientY
      const startLeft = container.scrollLeft
      const startTop = container.scrollTop
      const scrollsVertically = container.scrollHeight > container.clientHeight + 1
      let dragging = false
      const preventNativeDrag = (dragEvent: DragEvent) => dragEvent.preventDefault()
      window.addEventListener('dragstart', preventNativeDrag, { capture: true })

      const onMove = (moveEvent: PointerEvent) => {
        const deltaX = moveEvent.clientX - startX
        const deltaY = moveEvent.clientY - startY
        if (!dragging) {
          if (Math.abs(deltaX) < DRAG_THRESHOLD && Math.abs(deltaY) < DRAG_THRESHOLD) return
          if (Math.abs(deltaX) < Math.abs(deltaY) && !scrollsVertically) {
            cleanup()
            return
          }
          dragging = true
          document.documentElement.setAttribute('data-table-dragging', '')
        }
        window.getSelection()?.removeAllRanges()
        container.scrollLeft = startLeft - deltaX
        if (scrollsVertically) container.scrollTop = startTop - deltaY
        moveEvent.preventDefault()
      }

      const suppressClick = (clickEvent: MouseEvent) => {
        clickEvent.stopPropagation()
        clickEvent.preventDefault()
      }

      const onUp = () => {
        cleanup()
        if (!dragging) return
        window.addEventListener('click', suppressClick, { capture: true, once: true })
        window.setTimeout(() => window.removeEventListener('click', suppressClick, { capture: true }), 0)
      }

      const cleanup = () => {
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
        window.removeEventListener('pointercancel', onUp)
        window.removeEventListener('dragstart', preventNativeDrag, { capture: true })
        document.documentElement.removeAttribute('data-table-dragging')
      }

      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
      window.addEventListener('pointercancel', onUp)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [])

  const holdDelayRef = React.useRef<number | null>(null)
  const heldRef = React.useRef(false)

  const stopHold = React.useCallback(() => {
    if (holdDelayRef.current !== null) {
      window.clearTimeout(holdDelayRef.current)
      holdDelayRef.current = null
    }
    if (holdRef.current !== null) {
      window.clearInterval(holdRef.current)
      holdRef.current = null
    }
  }, [])

  React.useEffect(() => stopHold, [stopHold])

  const startHold = React.useCallback((direction: -1 | 1) => {
    stopHold()
    heldRef.current = false
    holdDelayRef.current = window.setTimeout(() => {
      holdDelayRef.current = null
      heldRef.current = true
      holdRef.current = window.setInterval(() => {
        activeRef.current?.scrollBy({ left: direction * HOLD_STEP })
      }, 16)
    }, HOLD_DELAY)
  }, [stopHold])

  const step = React.useCallback((direction: -1 | 1) => {
    if (heldRef.current) {
      heldRef.current = false
      return
    }
    activeRef.current?.scrollBy({ left: direction * BUTTON_STEP, behavior: 'smooth' })
  }, [])

  const scrollToTrackPosition = React.useCallback((clientX: number, grabOffset: number) => {
    const active = activeRef.current
    const track = trackRef.current
    if (!active || !track || !bar) return
    const rect = track.getBoundingClientRect()
    const usable = rect.width - bar.thumbWidth
    if (usable <= 0) return
    const position = Math.min(Math.max(clientX - rect.left - grabOffset, 0), usable)
    active.scrollLeft = (position / usable) * (active.scrollWidth - active.clientWidth)
  }, [bar])

  const onTrackPointerDown = React.useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!bar || !trackRef.current) return
    event.preventDefault()
    const rect = trackRef.current.getBoundingClientRect()
    const offsetInTrack = event.clientX - rect.left
    const onThumb = offsetInTrack >= bar.thumbLeft && offsetInTrack <= bar.thumbLeft + bar.thumbWidth
    const grabOffset = onThumb ? offsetInTrack - bar.thumbLeft : bar.thumbWidth / 2
    scrollToTrackPosition(event.clientX, grabOffset)
    const onMove = (moveEvent: PointerEvent) => scrollToTrackPosition(moveEvent.clientX, grabOffset)
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      document.documentElement.removeAttribute('data-table-dragging')
    }
    document.documentElement.setAttribute('data-table-dragging', '')
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }, [bar, scrollToTrackPosition])

  return (
    <>
      <style>{STYLE}</style>
      {bar ? (
        <div
          className="fixed z-sticky flex items-center gap-1 rounded-lg border bg-background p-1 shadow-md"
          style={{ left: bar.left, width: bar.width, bottom: BAR_GAP }}
          title={t('ui.tableScroll.hint', 'Drag the table, drag this bar, or hold Shift and scroll to move left and right')}
        >
          <IconButton
            type="button"
            variant="ghost"
            size="sm"
            aria-label={t('ui.tableScroll.left', 'Scroll left')}
            disabled={!bar.canLeft}
            onClick={() => step(-1)}
            onPointerDown={() => startHold(-1)}
            onPointerUp={stopHold}
            onPointerLeave={stopHold}
          >
            <ChevronLeft className="size-4" />
          </IconButton>
          <div
            ref={trackRef}
            className="relative h-3 flex-1 cursor-pointer rounded-full bg-muted"
            onPointerDown={onTrackPointerDown}
          >
            <div
              className="absolute inset-y-0 rounded-full bg-muted-foreground/60 transition-colors hover:bg-muted-foreground"
              style={{ left: bar.thumbLeft, width: bar.thumbWidth }}
            />
          </div>
          <IconButton
            type="button"
            variant="ghost"
            size="sm"
            aria-label={t('ui.tableScroll.right', 'Scroll right')}
            disabled={!bar.canRight}
            onClick={() => step(1)}
            onPointerDown={() => startHold(1)}
            onPointerUp={stopHold}
            onPointerLeave={stopHold}
          >
            <ChevronRight className="size-4" />
          </IconButton>
        </div>
      ) : null}
    </>
  )
}
