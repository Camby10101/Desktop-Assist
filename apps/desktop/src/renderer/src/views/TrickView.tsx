import { useEffect, useRef, useState } from 'react'
import { iconOf, trickFrame, type TrickPlan } from '@shared/tricks'

/** What the main process sends a trick's page (in its query string). */
interface Trick {
  plan: TrickPlan
  /** Each icon cut out of a screenshot, and a strip of plain taskbar beside it (PNG data URLs). */
  icons: string[]
  patches: string[]
}

/** How close (0 to 441) a pixel's colour is to the taskbar's for it to count as background. */
const BACKGROUND = 38

function load(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = reject
    image.src = url
  })
}

/** The patch's average colour: the taskbar's, there. */
function averageOf(image: HTMLImageElement): [number, number, number] {
  const canvas = document.createElement('canvas')
  canvas.width = image.width
  canvas.height = image.height
  const g = canvas.getContext('2d')!
  g.drawImage(image, 0, 0)
  const { data } = g.getImageData(0, 0, canvas.width, canvas.height)
  const sum = [0, 0, 0]
  for (let i = 0; i < data.length; i += 4) for (let k = 0; k < 3; k++) sum[k]! += data[i + k]!
  const count = data.length / 4 || 1
  return [sum[0]! / count, sum[1]! / count, sum[2]! / count]
}

/** The icon with the taskbar's colour behind it taken out (see-through), so only the icon flies. */
function cutOut(image: HTMLImageElement, background: [number, number, number]): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = image.width
  canvas.height = image.height
  const g = canvas.getContext('2d')!
  g.drawImage(image, 0, 0)
  const pixels = g.getImageData(0, 0, canvas.width, canvas.height)
  const { data } = pixels
  for (let i = 0; i < data.length; i += 4) {
    const distance = Math.hypot(
      data[i]! - background[0],
      data[i + 1]! - background[1],
      data[i + 2]! - background[2],
    )
    if (distance < BACKGROUND) data[i + 3] = 0
    else if (distance < BACKGROUND * 1.6)
      data[i + 3] = Math.round((data[i + 3]! * (distance - BACKGROUND)) / (BACKGROUND * 0.6))
  }
  g.putImageData(pixels, 0, 0)
  return canvas
}

/**
 * One of her tricks with the taskbar's icons (see shared/tricks.ts), in a see-through window over
 * the bottom of her screen that never takes the mouse: from the plan (sent once the page asks for
 * it) and the time it began (in the query string), each frame it covers the buttons whose icons are "out" with a strip of plain
 * taskbar, draws their icons where the trick has them, and its sparkles. The main process moves her
 * in step, and closes the window when it's over.
 */
export function TrickView() {
  const [params] = useState(() => new URLSearchParams(window.location.search))
  const canvas = useRef<HTMLCanvasElement>(null)

  // The plan and the icons come from the main process once the page asks (too much for the
  // query string).
  const [trick, setTrick] = useState<Trick | null>(null)
  useEffect(() => {
    const stop = window.assist.onTrickPlan((sent) => {
      try {
        setTrick(JSON.parse(sent) as Trick)
      } catch {
        // Not a trick: nothing to draw.
      }
    })
    window.assist.trickReady()
    return stop
  }, [])

  useEffect(() => {
    const element = canvas.current
    if (!element || !trick) return
    const starts = Number(params.get('starts')) || Date.now()
    const origin = { x: window.screenX, y: window.screenY }
    const ratio = window.devicePixelRatio || 1
    element.width = Math.round(window.innerWidth * ratio)
    element.height = Math.round(window.innerHeight * ratio)
    const g = element.getContext('2d')!
    g.scale(ratio, ratio)
    g.imageSmoothingEnabled = false
    let frame = 0
    let alive = true
    void Promise.all([
      Promise.all(trick.icons.map(load)),
      Promise.all(trick.patches.map(load)),
    ]).then(([icons, patches]) => {
      if (!alive) return
      const cutouts = icons.map((icon, k) => cutOut(icon, averageOf(patches[k]!)))
      const tick = () => {
        const moment = trickFrame(trick.plan, Date.now() - starts)
        g.clearRect(0, 0, window.innerWidth, window.innerHeight)
        for (const slot of moment.covered) {
          const r = trick.plan.slots[slot]!
          g.drawImage(patches[slot]!, r.x - origin.x, r.y - origin.y, r.width, r.height)
        }
        for (const icon of moment.icons) {
          const size = iconOf(trick.plan.slots[icon.slot]!).size
          g.save()
          g.translate(icon.x - origin.x, icon.y - origin.y)
          g.rotate(icon.angle)
          g.drawImage(cutouts[icon.slot]!, -size / 2, -size / 2, size, size)
          g.restore()
        }
        const pixel = Math.max(2, Math.round(2 * trick.plan.scale))
        for (const sparkle of moment.sparkles) {
          const x = Math.round(sparkle.x - origin.x)
          const y = Math.round(sparkle.y - origin.y)
          g.fillStyle = '#fde68a'
          g.fillRect(x - pixel * 1.5, y - pixel / 2, pixel * 3, pixel)
          g.fillRect(x - pixel / 2, y - pixel * 1.5, pixel, pixel * 3)
          g.fillStyle = '#ffffff'
          g.fillRect(x - pixel / 2, y - pixel / 2, pixel, pixel)
        }
        if (!moment.done) frame = requestAnimationFrame(tick)
      }
      frame = requestAnimationFrame(tick)
    })
    return () => {
      alive = false
      cancelAnimationFrame(frame)
    }
  }, [params, trick])

  return <canvas ref={canvas} aria-hidden className="block h-full w-full" />
}
