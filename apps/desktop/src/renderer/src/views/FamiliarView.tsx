import { useEffect, useRef, useState } from 'react'
import { FAMILIAR, type Pose } from '@shared/character'
import { DEFAULT_SIZE, snapSize } from '@shared/geometry'
import { CAT_SIZE, catFrames, PUFF_MS, type CatFrame } from '../character/cat'
import { framePaths } from '../character/sprite'
import { arriveCat, stepCat, type Cat, type Her } from '../lib/familiar'
import '../components/character.css'

/** The cat's frame at `now`: its pose's frames, round and round. */
function frameAt(frames: readonly CatFrame[], now: number): CatFrame {
  const total = frames.reduce((sum, f) => sum + f.ms, 0)
  let left = now % total
  for (const frame of frames) {
    if (left < frame.ms) return frame
    left -= frame.ms
  }
  return frames[0]!
}

/**
 * Her familiar, the black cat (see lib/familiar.ts), in a see-through window along the taskbar
 * that never takes the mouse. It appears beside her in a puff of smoke, wanders, follows her and
 * joins in with what she's doing until its time is up (`ends`, Date.now()), and vanishes in another
 * puff just before the main process closes the window. The query string says her size (`scale`,
 * and so the cat's) and where she stands (`from`); then the main process tells it where she is and
 * what she's doing as that changes (onFamiliarSees).
 */
export function FamiliarView() {
  const [params] = useState(() => new URLSearchParams(window.location.search))
  const scale = snapSize(Number(params.get('scale')) || DEFAULT_SIZE)
  const box = CAT_SIZE * scale
  const her = useRef<Her>({ x: Number(params.get('from')) || 0, pose: 'idle' })
  const ends = useRef(Number(params.get('ends')) || Date.now() + FAMILIAR.summonMs)
  const [still] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  const [shown, setShown] = useState<{ cat: Cat; frame: CatFrame; puff: CatFrame | null } | null>(
    null,
  )

  useEffect(
    () =>
      window.assist.onFamiliarSees((seen: { x: number; pose: Pose; ends: number }) => {
        her.current = { x: seen.x, pose: seen.pose }
        ends.current = seen.ends
      }),
    [],
  )

  useEffect(() => {
    const room = () => ({ width: window.innerWidth, box, scale })
    const born = Date.now()
    let cat = arriveCat(her.current.x, room(), born)
    let last = born
    const timer = setInterval(() => {
      const now = Date.now()
      if (!still) cat = stepCat(cat, now, now - last, room(), her.current, Math.random)
      last = now
      // A puff of smoke as it comes and as it goes: it's hidden under the first half of the one,
      // and gone after the middle of the other.
      const since = now - born
      const left = ends.current - now
      const puffing = since < PUFF_MS ? since / PUFF_MS : left < PUFF_MS ? 1 - left / PUFF_MS : null
      const puffFrames = catFrames('puff', 'right')
      const puff =
        puffing === null
          ? null
          : puffFrames[
              Math.min(puffFrames.length - 1, Math.floor(Math.max(0, puffing) * puffFrames.length))
            ]!
      const hidden = (since < PUFF_MS / 2 || left < PUFF_MS / 2) && !still
      setShown(
        hidden
          ? { cat, frame: { rows: [], ms: 0 }, puff }
          : { cat, frame: frameAt(catFrames(cat.pose, cat.facing), now), puff },
      )
    }, 50)
    return () => clearInterval(timer)
  }, [box, scale, still])

  if (!shown) return null
  const svg = (rows: string[]) => (
    <svg
      viewBox={`0 0 ${CAT_SIZE} ${CAT_SIZE}`}
      width={box}
      height={box}
      shapeRendering="crispEdges"
      className="character absolute bottom-0 left-0"
      aria-hidden
    >
      {framePaths(rows).map(({ className, d }) => (
        <path key={className} className={className} d={d} />
      ))}
    </svg>
  )
  return (
    <div aria-hidden className="relative h-full w-full overflow-hidden">
      <div
        className="absolute bottom-0 left-0"
        style={{ width: box, height: box, transform: `translateX(${Math.round(shown.cat.x)}px)` }}
      >
        {shown.frame.rows.length > 0 && svg(shown.frame.rows)}
        {shown.puff && svg(shown.puff.rows)}
      </div>
    </div>
  )
}
