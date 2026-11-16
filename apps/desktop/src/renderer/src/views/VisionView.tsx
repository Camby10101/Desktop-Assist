import { useEffect, useState } from 'react'
import { FIDGET_MS, VISION } from '@shared/character'
import { bubbleMetrics, DEFAULT_SIZE, snapSize } from '@shared/geometry'

// The tenant's logo, bundled with the page (a PNG, or an SVG if that's all the tenant has).
const logos = import.meta.glob<string>('@tenant/logo.{png,svg}', {
  query: '?url',
  import: 'default',
  eager: true,
})
const LOGO =
  Object.entries(logos).find(([path]) => path.endsWith('.png'))?.[1] ?? Object.values(logos)[0]

/** Slow in, slow out (0 to 1). */
const smooth = (t: number) => t * t * (3 - 2 * t)
/** How far through `[from, to]` (ms) `now` is, 0 to 1. */
const through = (now: number, [from, to]: readonly [number, number]) =>
  Math.min(Math.max((now - from) / (to - from), 0), 1)

/**
 * Her `vision` habit, above her: a column of soft light falls from the top of the screen to her,
 * and the company's logo comes down it to hover over her head, glowing, then rises away and the
 * light fades (VISION's timetable). The window is a column over her that never takes the mouse;
 * her own window, in front of it, plays her looking up. Everything comes in the query string: her
 * size (`scale`), where her middle is across the window (`centre`) and when the vision started
 * (`starts`, Date.now()), so the page keeps in time with her even if it took a moment to load.
 */
export function VisionView() {
  const [params] = useState(() => new URLSearchParams(window.location.search))
  const scale = snapSize(Number(params.get('scale')) || DEFAULT_SIZE)
  const centre = Number(params.get('centre')) || window.innerWidth / 2
  const starts = Number(params.get('starts')) || Date.now()
  const [now, setNow] = useState(() => Date.now() - starts)
  // With Windows' reduced-motion setting the logo just hovers in its light, as she holds still.
  const [still] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)

  useEffect(() => {
    if (still) return
    let frame = requestAnimationFrame(function tick() {
      setNow(Date.now() - starts)
      if (Date.now() - starts < FIDGET_MS.vision) frame = requestAnimationFrame(tick)
    })
    return () => cancelAnimationFrame(frame)
  }, [starts, still])

  const { box } = bubbleMetrics(scale)
  const height = window.innerHeight
  const light = still
    ? 1
    : smooth(through(now, VISION.lightIn)) * (1 - smooth(through(now, VISION.lightOut)))
  // The logo: about half her width, hovering just above her hat (4 sprite pixels below the top of
  // her window), bobbing gently while it's there.
  const size = Math.round(44 * scale)
  const hover = height - box + 4 * scale - 10 * scale - size
  const down = still ? 1 : smooth(through(now, VISION.descend))
  const up = still ? 0 : smooth(through(now, VISION.ascend))
  const bob = Math.sin((now / 900) * Math.PI * 2) * 3 * scale
  const top =
    -size - 20 + (hover + size + 20) * down - (hover + size + 20) * up + bob * down * (1 - up)

  return (
    <div aria-hidden className="relative h-full w-full overflow-hidden">
      {/* The light: narrow at the top of the screen, widening as it falls on her. */}
      <div
        className="absolute top-0"
        style={{
          left: centre,
          width: box * 1.8,
          height: height - 2 * scale,
          transform: 'translateX(-50%)',
          opacity: light,
          clipPath: 'polygon(38% 0, 62% 0, 100% 100%, 0 100%)',
          background:
            'linear-gradient(to bottom, rgb(255 248 220 / 0), rgb(255 248 220 / 0.55) 35%, rgb(255 244 210 / 0.35) 85%, rgb(255 244 210 / 0.1))',
          filter: `blur(${Math.max(2, 3 * scale)}px)`,
        }}
      />
      {/* Where the light lands: a soft glow on the ground under her. */}
      <div
        className="absolute rounded-[50%]"
        style={{
          left: centre,
          bottom: 0,
          width: box * 1.4,
          height: 10 * scale,
          transform: 'translate(-50%, 40%)',
          opacity: light * 0.8,
          background: 'radial-gradient(rgb(255 248 220 / 0.8), rgb(255 248 220 / 0))',
        }}
      />
      {LOGO && (
        <img
          src={LOGO}
          alt=""
          className="absolute"
          style={{
            left: centre,
            top,
            width: size,
            height: size,
            transform: 'translateX(-50%)',
            filter: `drop-shadow(0 0 ${4 * scale}px rgb(255 244 200 / 0.95)) drop-shadow(0 0 ${10 * scale}px rgb(255 240 190 / 0.6))`,
          }}
        />
      )}
    </div>
  )
}
