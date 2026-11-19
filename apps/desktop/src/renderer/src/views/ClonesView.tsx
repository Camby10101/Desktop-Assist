import { useEffect, useRef, useState } from 'react'
import { CLONES } from '@shared/character'
import { bubbleMetrics, DEFAULT_SIZE, snapSize } from '@shared/geometry'
import { Character } from '../components/Character'
import { useAccentColor, useRobeColor } from '../hooks/useAssistState'
import { clonePose, spawnClones, stepClone, type Clone, type Room } from '../lib/clones'

/**
 * Her clones (the Clones spell), in a see-through window along the taskbar that never takes the
 * mouse: CLONES.count of her, at her size, setting off from where she stands and wandering up and
 * down (see lib/clones.ts), each stopping now and then. They fade in, and fade out just before
 * the main process closes the window. Everything they need comes in the query string: where she
 * stands (`from`), her size (`scale`), the accent colour, and when they end (`ends`, Date.now()).
 */
export function ClonesView() {
  const [params] = useState(() => new URLSearchParams(window.location.search))
  const scale = snapSize(Number(params.get('scale')) || DEFAULT_SIZE)
  const { box } = bubbleMetrics(scale)
  useAccentColor(params.get('accent') ?? undefined)
  useRobeColor(params.get('robe'))
  // Her hat off (Settings → No hat), theirs too.
  const hat = params.get('hat') !== 'off'

  // With Windows' reduced-motion setting they stand still, spread along the taskbar.
  const [still] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  const [clones, setClones] = useState<Clone[]>(() => {
    const room = { width: window.innerWidth, box, scale }
    const spawned = spawnClones(
      CLONES.count,
      Number(params.get('from')) || 0,
      performance.now(),
      room,
      Math.random,
    )
    if (!still) return spawned
    const far = Math.max(0, room.width - box)
    return spawned.map((clone, i) => ({ ...clone, x: (far * (i + 0.5)) / spawned.length }))
  })
  const [visible, setVisible] = useState(false)
  const boxes = useRef<(HTMLDivElement | null)[]>([])

  // Each frame, move them (straight in the page, not through React) and redraw only when one of
  // them starts or stops walking.
  useEffect(() => {
    if (still) return
    let current = clones
    let last = performance.now()
    let frame = requestAnimationFrame(function tick(now) {
      const room: Room = { width: window.innerWidth, box, scale }
      const next = current.map((clone) => stepClone(clone, now, now - last, room, Math.random))
      last = now
      next.forEach((clone, i) => {
        const element = boxes.current[i]
        if (element) element.style.transform = `translateX(${Math.round(clone.x)}px)`
      })
      if (
        next.some(
          (clone, i) =>
            clonePose(clone) !== clonePose(current[i]!) || clone.facing !== current[i]!.facing,
        )
      ) {
        setClones(next)
      }
      current = next
      frame = requestAnimationFrame(tick)
    })
    return () => cancelAnimationFrame(frame)
    // Started once: the loop keeps its own copy of where they are.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // In, and out again just before their time is up.
  useEffect(() => {
    const show = requestAnimationFrame(() => setVisible(true))
    const ends = Number(params.get('ends')) || Date.now() + CLONES.durationMs
    const hide = setTimeout(() => setVisible(false), ends - CLONES.fadeMs - Date.now())
    return () => {
      cancelAnimationFrame(show)
      clearTimeout(hide)
    }
  }, [params])

  return (
    <div
      aria-hidden
      className="relative h-full w-full overflow-hidden"
      style={{ opacity: visible ? 1 : 0, transition: `opacity ${CLONES.fadeMs}ms ease-out` }}
    >
      {clones.map((clone, i) => (
        <div
          key={i}
          ref={(element) => {
            boxes.current[i] = element
          }}
          className="absolute bottom-0 left-0"
          style={{ transform: `translateX(${Math.round(clone.x)}px)` }}
        >
          <Character pose={clonePose(clone)} facing={clone.facing} box={box} hat={hat} />
        </div>
      ))}
    </div>
  )
}
