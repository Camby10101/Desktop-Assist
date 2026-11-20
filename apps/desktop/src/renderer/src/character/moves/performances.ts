// Her performances' poses (HELD_POSES): watching the pointer, peeking round a window, waving
// through a portal, and her battle with monsters.

import { PORTAL } from '@shared/character'
import { BATTLE } from '@shared/battle'
import { draw, GRID, HEADROOM, type Face, type Pose } from '../rig'
import {
  type Key,
  type Frame,
  smooth,
  lerp,
  ARM_DOWN,
  FRAME_MS,
  hold,
  FRONT,
  between,
  through,
  type Moves,
  once,
  repeating,
} from './kit'

/**
 * Facing monsters (her battle), seen diagonally: her near hand held out toward them, a glow
 * charging in it, her other hand back; breathing, watching them, steady.
 */
export function ready(): Key[] {
  return Array.from({ length: 16 }, (_, i) => {
    const phase = (i / 16) * Math.PI * 2
    return {
      pose: {
        view: 'diagonal',
        face: 'neutral',
        lean: 0.04,
        charge: 0.5 + 0.3 * Math.sin(phase),
        arms: [
          { shoulder: 1.15 + 0.03 * Math.sin(phase), elbow: 0.35 },
          { shoulder: 0.35, elbow: 0.5 },
        ],
      },
      ms: 80,
    }
  })
}

/**
 * Casting at a monster (her battle), seen diagonally: she thrusts her hand out at it, the glow
 * flaring into a sparkle as the bolt leaves her hand (BATTLE.launchMs in), then draws it back.
 */
export function cast(): Key[] {
  return through(BATTLE.castMs, (t) => {
    const thrust = Math.sin(Math.min(1, t / 0.37) * (Math.PI / 2)) * (1 - between(t, 0.6, 1))
    return {
      view: 'diagonal',
      face: t < 0.5 ? 'chant' : 'neutral',
      lean: 0.04 + 0.05 * thrust,
      charge: t < 0.37 ? 0.6 + t : t < 0.5 ? 0.9 : 0.3,
      arms: [
        { shoulder: 1.15 + 0.4 * thrust, elbow: 0.35 - 0.35 * thrust },
        { shoulder: 0.35, elbow: 0.5 },
      ],
    }
  })
}

/** Watching, before the main process says where the pointer is: looking ahead, blinking now and then. */
export function watch(): Key[] {
  return [...hold(FRONT, 2400), ...hold({ view: 'front', face: 'blink' }, 120)]
}

/**
 * Peeking round the edge of a window, from the front (mirrored to peek the other way): leaning
 * out to the right, looking that way, a blink, a smile and a little wave, round and round.
 */
export function peek(): Key[] {
  const out = (face: Face, wave = 0): Pose => ({
    view: 'front',
    face,
    look: 1,
    lean: 0.22,
    x: 2,
    tilt: 0.06,
    arms: wave ? [{ shoulder: 2.9, elbow: 0.2 + 0.35 * wave }, ARM_DOWN] : [ARM_DOWN, ARM_DOWN],
  })
  return [
    ...hold(out('neutral'), 700),
    ...hold(out('blink'), 120),
    ...hold(out('happy'), 400),
    ...Array.from({ length: 8 }, (_, i) => ({
      pose: out('happy', Math.sin((i / 4) * Math.PI * 2)),
      ms: 70,
    })),
    ...hold(out('neutral'), 500),
  ]
}

/** The portal's middle, and its half-width and half-height when fully open (grid pixels). */
export const PORTAL_SHAPE = { x: 48, y: 50, rx: 29, ry: 42 }

/** How far down she's drawn in the portal (her hips, pixels): seen from the knees up; and hidden. */
export const PORTAL_SHOWN = 18

export const PORTAL_HIDDEN = 72

export const fraction = (v: number) => v - Math.floor(v)

/**
 * A frame of the portal: `her` frame (or none) seen through it, open `open` (0 to 1), its swirl
 * turned to `t` seconds. Inside, her pixels over the swirl (deep, mid and light teal bands turning
 * round its middle); outside it, nothing (so whatever of her is outside it is cut away, as if she
 * were on its far side); round its edge, a glowing rim, in front of her, with sparkles running
 * round it.
 */
export function portalFrame(her: string[] | null, open: number, t: number): string[] {
  const { x: cx, y: cy, rx, ry } = PORTAL_SHAPE
  return Array.from({ length: GRID + HEADROOM }, (_, row) => {
    const y = row - HEADROOM
    let line = ''
    for (let x = 0; x < GRID; x++) {
      if (open <= 0.02) {
        line += '.'
        continue
      }
      const dx = (x + 0.5 - cx) / (rx * open)
      const dy = (y + 0.5 - cy) / (ry * open)
      const d = Math.hypot(dx, dy)
      if (d > 1) {
        line += '.'
        continue
      }
      // How far in from the rim, in pixels (about).
      const edge = (1 - d) * Math.min(rx, ry) * open
      const angle = Math.atan2(dy, dx) / (Math.PI * 2)
      if (edge < 2.2) {
        const sparkle = edge < 1.4 && fraction(angle * 10 - t * 0.8) < 0.06
        line += sparkle ? 'w' : edge < 1.1 ? 'R' : 'r'
        continue
      }
      const pixel = her?.[row]?.[x] ?? '.'
      if (pixel !== '.' && pixel !== 'x') {
        line += pixel
        continue
      }
      const band = fraction(angle * 3 + d * 2.2 - t * 0.9)
      line += d < 0.18 ? 'r' : band < 0.16 ? 'r' : band < 0.5 ? 'p' : 'd'
    }
    return line
  })
}

/** Her in the portal: from the front, `y` pixels down, waving (`wave`, 0 to 1 round a wave). */
export function inPortal(y: number, wave: number, face: Face = 'happy'): Pose {
  const swing = Math.sin(wave * Math.PI * 2)
  return {
    view: 'front',
    y,
    shadow: false,
    face,
    tilt: 0.05 * swing,
    arms: [
      { shoulder: 2.55 + 0.12 * swing, elbow: 0.3 + 0.55 * swing },
      { shoulder: 0.3, elbow: 0.35 },
    ],
  }
}

/**
 * Waving through a portal on top of a window (her `portal` pose, played once: PORTAL): a ring of
 * light opens; she rises into it from below, as if on its far side, seen from the knees up; waves
 * a while, blinking now and then; sinks away; and it closes, leaving nothing. `back`: clicked, she
 * goes back at once (her `portal-back` pose): just the sinking away and the closing.
 */
export function portal(back = false): Frame[] {
  const keys: { open: number; her: Pose | null; ms: number }[] = []
  // `ms` split into frames of about `step` ms whose lengths add up to exactly `ms`.
  const phase = (
    ms: number,
    step: number,
    at: (u: number, i: number) => Omit<(typeof keys)[number], 'ms'>,
  ) => {
    const count = Math.max(1, Math.round(ms / step))
    for (let i = 0; i < count; i++) {
      keys.push({
        ...at((i + 1) / count, i),
        ms: Math.round(((i + 1) * ms) / count) - Math.round((i * ms) / count),
      })
    }
  }
  const { openMs, riseMs, waveMs, sinkMs, closeMs } = PORTAL
  if (!back) {
    phase(openMs, FRAME_MS, (u) => ({ open: smooth(u), her: null }))
    phase(riseMs, FRAME_MS, (u) => ({
      open: 1,
      her: inPortal(lerp(PORTAL_HIDDEN, PORTAL_SHOWN, smooth(u)), 0),
    }))
    // A wave every eight frames.
    phase(waveMs, 80, (_, i) => ({
      open: 1,
      her: inPortal(PORTAL_SHOWN, (i % 8) / 8, i % 23 === 11 ? 'blink' : 'happy'),
    }))
  }
  phase(sinkMs, FRAME_MS, (u) => ({
    open: 1,
    her: inPortal(lerp(PORTAL_SHOWN, PORTAL_HIDDEN, smooth(u)), 0),
  }))
  phase(closeMs, FRAME_MS, (u) => ({ open: 1 - smooth(u), her: null }))
  let t = 0
  return keys.map(({ open, her, ms }) => {
    const rows = portalFrame(her ? draw(her) : null, open, t)
    t += ms / 1000
    return { rows, ms }
  })
}

/** Her performances' poses: held for as long as the performance says, but the portal's, which play once. */
export const PERFORMANCE_MOVES = {
  watch: repeating(watch),
  'peek-left': repeating(peek),
  'peek-right': repeating(peek),
  portal: { frames: () => portal(), loops: false },
  'portal-back': { frames: () => portal(true), loops: false },
  'ready-left': repeating(ready),
  'ready-right': repeating(ready),
  'cast-left': once(cast),
  'cast-right': once(cast),
} satisfies Moves
