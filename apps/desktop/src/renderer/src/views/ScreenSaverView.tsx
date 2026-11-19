import { useEffect, useRef, useState } from 'react'
import { SCREEN_SAVER, type SaverScene } from '@shared/screenSaver'
import { GRID, HEADROOM } from '../character/rig'
import { gazeFrames, PALETTE, setHat, type Frame } from '../character/sprite'
import { useAccentColor, useRobeColor } from '../hooks/useAssistState'
import { backlit, paintHer } from '../lib/screensaver/her'
import type { SaverFrame } from '../lib/screensaver/scene'
import { paintNight, paintStarfall } from '../lib/screensaver/stars'
import {
  herSpot,
  paintClouds,
  paintEveningStars,
  paintLife,
  paintSun,
  paintSunsetHills,
  paintSunsetSky,
} from '../lib/screensaver/sunset'
import { canvasPainter } from '../lib/spellArt'
import type { Painter } from '../lib/pixels'
import '../components/character.css'

/** About how many pixels high the scenes are, whatever the screen: chunky pixel art. */
const SCENE_HEIGHT = 360
/** The scenes move slowly: they're drawn this often (ms), not every frame. */
const DRAW_EVERY_MS = 50

/**
 * One of the screen saver's windows (see ScreenSaver in the main process), over the whole of a
 * display, the taskbar too. The query string says which scene (her sunset, or the starfall), when
 * it started (wall-clock ms, so every screen keeps in time) and her accent colour. The screen fades
 * to white, then the scene fades in out of the white: drawn on a small canvas, a pixel at a time,
 * stretched over the window without smoothing. Moving the mouse, clicking, scrolling or pressing a
 * key tells the main process the user's back; then the whole thing fades away (onScreensaverEnd),
 * back to the desktop, and the window closes. The fades are drawn frame by frame with the scene. The pointer's hidden over it.
 */
export function ScreenSaverView() {
  const [params] = useState(() => new URLSearchParams(window.location.search))
  const scene: SaverScene = params.get('scene') === 'sunset' ? 'sunset' : 'stars'
  const [starts] = useState(() => Number(params.get('starts')) || Date.now())
  const accent = /^#[0-9a-f]{6}$/i.test(params.get('accent') ?? '')
    ? params.get('accent')!
    : '#9333ea'
  useAccentColor(accent)
  // Her robe's colour, if one's chosen in Settings (before her colours are read, below).
  useRobeColor(params.get('robe'))
  // Her hat off (Settings → No hat), before her frames are drawn.
  setHat(params.get('hat') !== 'off')
  // With Windows' reduced-motion setting, the scene stays still (the fades still happen).
  const [still] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  /** When the main process said it's ending (wall-clock ms), or null: it fades away from then. */
  const endedAt = useRef<number | null>(null)
  const root = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const veil = useRef<HTMLDivElement>(null)

  // The user's back: the mouse moving (more than a nudge), a click, a scroll, a key, or another
  // window taking the focus. Said once.
  useEffect(() => {
    let woken = false
    let from: { x: number; y: number } | null = null
    const opened = Date.now()
    const wake = () => {
      if (woken) return
      woken = true
      window.assist.screensaver.wake()
    }
    // Where the pointer is in the window (which never moves): how far it's gone from where it was.
    const onMove = (event: MouseEvent) => {
      from ??= { x: event.clientX, y: event.clientY }
      if (Math.hypot(event.clientX - from.x, event.clientY - from.y) > SCREEN_SAVER.wakeMove) {
        wake()
      }
    }
    const onBlur = () => {
      if (Date.now() - opened > SCREEN_SAVER.blurGraceMs) wake()
    }
    const wakers = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const
    window.addEventListener('mousemove', onMove)
    window.addEventListener('blur', onBlur)
    for (const name of wakers) window.addEventListener(name, wake)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('blur', onBlur)
      for (const name of wakers) window.removeEventListener(name, wake)
    }
  }, [])

  useEffect(
    () =>
      window.assist.onScreensaverEnd(() => {
        endedAt.current ??= Date.now()
      }),
    [],
  )

  useEffect(() => {
    const whole = root.current
    const element = canvas.current
    const cover = veil.current
    if (!whole || !element || !cover) return
    const pixel = Math.max(2, Math.round(window.innerHeight / SCENE_HEIGHT))
    const w = Math.ceil(window.innerWidth / pixel)
    const h = Math.ceil(window.innerHeight / pixel)
    element.width = w
    element.height = h
    element.style.width = `${w * pixel}px`
    element.style.height = `${h * pixel}px`
    const g = element.getContext('2d')!
    const draw = scene === 'sunset' ? sunsetPainter(g, w, h) : starfallPainter(g, w, h)
    let drawnAt = Number.NEGATIVE_INFINITY
    let frame = requestAnimationFrame(function tick() {
      const now = Date.now()
      const t = now - starts
      // White over the desktop, then the scene out of the white.
      const { whiteMs, sceneMs } = SCREEN_SAVER
      const clearing = Math.min(1, Math.max(0, (t - whiteMs) / sceneMs))
      cover.style.opacity = String(
        t < whiteMs ? t / whiteMs : 1 - clearing * clearing * (3 - 2 * clearing),
      )
      element.style.visibility = t < whiteMs ? 'hidden' : 'visible'
      // Ending: all of it fades away, back to the desktop.
      if (endedAt.current !== null) {
        const gone = Math.min(1, (now - endedAt.current) / SCREEN_SAVER.fadeOutMs)
        whole.style.opacity = String(1 - gone * gone)
      }
      const due = still ? drawnAt < 0 : now - drawnAt >= DRAW_EVERY_MS
      if (t >= whiteMs && due) {
        drawnAt = now
        draw(still ? 0 : t - whiteMs)
      }
      frame = requestAnimationFrame(tick)
    })
    return () => cancelAnimationFrame(frame)
  }, [scene, starts, still])

  return (
    <div ref={root} className="fixed inset-0 overflow-hidden" style={{ cursor: 'none' }}>
      <canvas
        ref={canvas}
        aria-hidden
        className="absolute top-0 left-0"
        style={{ imageRendering: 'pixelated', visibility: 'hidden' }}
      />
      <div ref={veil} className="absolute inset-0 bg-white" style={{ opacity: 0 }} />
    </div>
  )
}

/** A canvas the size of the scene's, painted once by `paint` (for what never changes). */
function layer(w: number, h: number, paint: (p: Painter) => void): HTMLCanvasElement {
  const element = document.createElement('canvas')
  element.width = w
  element.height = h
  paint(canvasPainter(element.getContext('2d')!))
  return element
}

/**
 * Her colours in the sunset, by palette letter: as the page's styles colour her (her robe and hat
 * from the accent colour), dimmed toward the dusk with the sun behind her.
 */
function herColours(g: CanvasRenderingContext2D): Record<string, string> {
  const ns = 'http://www.w3.org/2000/svg'
  const svg = document.createElementNS(ns, 'svg')
  svg.setAttribute('class', 'character')
  svg.style.position = 'absolute'
  svg.style.visibility = 'hidden'
  document.body.append(svg)
  const colours: Record<string, string> = {}
  for (const [letter, className] of Object.entries(PALETTE)) {
    const path = document.createElementNS(ns, 'path')
    path.setAttribute('class', className)
    svg.append(path)
    // The canvas says any CSS colour back as #rrggbb (or rgba() when see-through).
    g.fillStyle = '#000000'
    g.fillStyle = getComputedStyle(path).fill
    colours[letter] = backlit(String(g.fillStyle))
  }
  svg.remove()
  return colours
}

/** Her frame at `t`, round and round. */
function frameAt(frames: readonly Frame[], t: number): Frame {
  const total = frames.reduce((sum, f) => sum + f.ms, 0)
  let left = t % total
  for (const frame of frames) {
    if (left < frame.ms) return frame
    left -= frame.ms
  }
  return frames[0]!
}

/** Draws the sunset at `t`: the sky and hills painted once, the rest each time. */
function sunsetPainter(g: CanvasRenderingContext2D, w: number, h: number): (t: number) => void {
  const p = canvasPainter(g)
  const sky = layer(w, h, (q) => paintSunsetSky(q, w, h))
  const hills = layer(w, h, (q) => paintSunsetHills(q, w, h))
  const colours = herColours(g)
  const frames = gazeFrames()
  const spot = herSpot(w, h)
  return (t) => {
    const frame: SaverFrame = { t, w, h }
    g.globalAlpha = 1
    g.drawImage(sky, 0, 0)
    paintEveningStars(p, frame)
    paintSun(p, frame)
    paintClouds(p, frame)
    g.globalAlpha = 1
    g.drawImage(hills, 0, 0)
    paintLife(p, frame)
    // Her feet on the crest: her frame's bottom row (her shadow's) on the row under her soles.
    const rows = frameAt(frames, t).rows
    paintHer(p, rows, spot.x - GRID / 2, spot.feet - (GRID + HEADROOM) + 2, colours, 1)
  }
}

/** Draws the starfall at `t`: the sky and hills painted once, the stars each time. */
function starfallPainter(g: CanvasRenderingContext2D, w: number, h: number): (t: number) => void {
  const p = canvasPainter(g)
  const night = layer(w, h, (q) => paintNight(q, w, h))
  return (t) => {
    g.globalAlpha = 1
    g.drawImage(night, 0, 0)
    paintStarfall(p, { t, w, h })
  }
}
