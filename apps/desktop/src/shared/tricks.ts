import { FIDGET_MS, REACTION_MS, SPELL_POSE_MS, type Pose } from './character'
import { UI, type Rect } from './geometry'

// Her tricks with the taskbar's icons (all pretend: nothing on the taskbar really moves; copies of
// its icons are drawn over it in a window of their own, and the real ones covered while they're
// "out"): carrying one about, juggling three, swapping two as a prank, perching on one, sneezing
// one flying and fetching it, and a wand tap. Each is a timeline of beats, worked out the same way
// by the main process (which moves her) and the trick's page (which draws the icons), from the
// same plan and the same clock. Everything is in DIPs on the screen.

export const TRICKS = ['carry', 'juggle-icons', 'swap', 'perch', 'knock', 'tap'] as const
export type TrickName = (typeof TRICKS)[number]

/** What a trick is worked out from. */
export interface TrickPlan {
  name: TrickName
  /** Her box's size, the top of her box standing on the taskbar, and where it is as it begins. */
  size: number
  ground: number
  from: number
  /** How big she is (1 is her usual size), for distances. */
  scale: number
  /** Her trick's icons: the taskbar buttons they're on (a button's whole rect). */
  slots: Rect[]
  /** The way toward the middle of the screen from her icons: 1 to the right, -1 to the left. */
  side: number
  /** The screen's edges she stays between (her box's left edge, at most). */
  minX: number
  maxX: number
}

/** An icon out of its button: which one (an index into `slots`), its middle, and how it's turned. */
export interface FlyingIcon {
  slot: number
  x: number
  y: number
  angle: number
}

/** A moment of a trick. */
export interface TrickFrame {
  her: { x: number; y: number; pose: Pose }
  /** Icons drawn somewhere other than their own button. */
  icons: FlyingIcon[]
  /** Buttons covered over (their icon is out, or swapped). */
  covered: number[]
  /** Sparkles (their middles). */
  sparkles: { x: number; y: number }[]
  /** Over: she's back where she was. */
  done: boolean
}

/** Further than this (DIP at her usual size), she goes by magic (vanishing and appearing) rather than walking. */
export const TRICK_TELEPORT = 360
/** How fast she walks in her tricks (DIP per second at her usual size): a brisk walk. */
export const TRICK_WALK = 130

/** The icon's size in a button (the square in its middle it's drawn in), and its middle. */
export function iconOf(slot: Rect): { size: number; x: number; y: number } {
  const size = Math.round(Math.min(slot.width, slot.height) * 0.5)
  return { size, x: slot.x + slot.width / 2, y: slot.y + slot.height / 2 - slot.height * 0.03 }
}

interface Beat {
  ms: number
  at: (u: number) => Omit<TrickFrame, 'done'>
}

const lerp = (a: number, b: number, u: number) => a + (b - a) * u
const ease = (u: number) => u * u * (3 - 2 * u)

/** The beats of a trick: going there, the trick itself, and coming back. */
export function beatsOf(plan: TrickPlan): Beat[] {
  const { size, ground, scale, slots } = plan
  // Her sprite reaches this far past her box all round: her feet are at ground + size + pad.
  const pad = UI.bubblePad * scale
  const sprite = size + 2 * pad
  const beats: Beat[] = []
  // What's out and covered between beats (an icon left somewhere, say): carried on.
  let covered: number[] = []
  let resting: FlyingIcon[] = []
  let x = plan.from
  // Each beat keeps what was out and covered as it was made (they change as the trick goes on).
  const still = (pose: Pose, ms: number) => {
    const at = x
    const keep = { icons: resting, covered }
    beats.push({ ms, at: () => ({ her: { x: at, y: ground, pose }, ...keep, sparkles: [] }) })
  }
  /** Above her head, where she holds an icon up (by magic), bobbing a little. */
  const overhead = (herX: number, slot: number, u: number, bob = true): FlyingIcon => {
    const icon = iconOf(slots[slot]!)
    return {
      slot,
      x: herX + size / 2,
      y: ground - icon.size * 0.7 - 2 * scale + (bob ? Math.sin(u * Math.PI * 6) * 2 * scale : 0),
      angle: 0,
    }
  }
  /** Goes to `to` (her box's left edge): walking, or by magic if it's far; `carry` held up above her. */
  const go = (to: number, carry: number[] = []) => {
    to = Math.min(Math.max(to, plan.minX), plan.maxX)
    const from = x
    const distance = Math.abs(to - from)
    if (distance < 2) return
    const held = (herX: number, u: number) =>
      carry.map((slot, k) => ({
        ...overhead(herX, slot, u),
        x: herX + size / 2 + (k - (carry.length - 1) / 2) * iconOf(slots[slot]!).size,
      }))
    if (distance > TRICK_TELEPORT * scale && carry.length === 0) {
      const keep = { icons: resting, covered }
      beats.push({
        ms: SPELL_POSE_MS.vanish,
        at: () => ({ her: { x: from, y: ground, pose: 'vanish' }, ...keep, sparkles: [] }),
      })
      beats.push({
        ms: SPELL_POSE_MS.appear,
        at: () => ({ her: { x: to, y: ground, pose: 'appear' }, ...keep, sparkles: [] }),
      })
    } else {
      const ms = (distance / (TRICK_WALK * scale)) * 1000
      const pose: Pose = to < from ? 'walk-left' : 'walk-right'
      const keep = { resting, covered }
      beats.push({
        ms,
        at: (u) => {
          const herX = lerp(from, to, u)
          return {
            her: { x: herX, y: ground, pose },
            icons: [...keep.resting, ...held(herX, (u * ms) / 1000)],
            covered: keep.covered,
            sparkles: [],
          }
        },
      })
    }
    x = to
  }
  /** Her box's left edge for standing over a button. */
  const over = (slot: number) => iconOf(slots[slot]!).x - size / 2
  /** An icon rising from its button to over her head (or the other way), as she lifts (lowers) her arms. */
  const lift = (slot: number, down = false) => {
    const at = x
    const home = iconOf(slots[slot]!)
    const keep = {
      resting: resting.filter((r) => r.slot !== slot),
      covered: covered.includes(slot) ? covered : [...covered, slot],
    }
    beats.push({
      ms: down ? REACTION_MS.lower : REACTION_MS.lift,
      at: (u) => {
        const up = overhead(at, slot, 0, false)
        const v = ease(down ? 1 - u : u)
        return {
          her: { x: at, y: ground, pose: down ? 'lower' : 'lift' },
          icons: [
            ...keep.resting,
            { slot, x: lerp(home.x, up.x, v), y: lerp(home.y, up.y, v), angle: 0 },
          ],
          covered: keep.covered,
          sparkles:
            u > 0.1 && u < 0.9
              ? [
                  {
                    x: lerp(home.x, up.x, v) + Math.cos(u * 12) * home.size * 0.7,
                    y: lerp(home.y, up.y, v),
                  },
                ]
              : [],
        }
      },
    })
    resting = keep.resting
    covered = down ? keep.covered.filter((c) => c !== slot) : keep.covered
  }

  const a = 0
  switch (plan.name) {
    case 'tap': {
      // A wand tap: sparkles round the icon, and it gives a little hop or two, delighted.
      go(over(a))
      const icon = iconOf(slots[a]!)
      const at = x
      beats.push({
        ms: FIDGET_MS.spell,
        at: (u) => {
          const hopping = u > 0.3 && u < 0.8
          const hop = hopping ? Math.abs(Math.sin(((u - 0.3) / 0.5) * Math.PI * 2)) * 8 * scale : 0
          const sparkles =
            u > 0.15 && u < 0.9
              ? [0, 1, 2].map((k) => ({
                  x: icon.x + Math.cos(u * 9 + (k * Math.PI * 2) / 3) * icon.size * 0.9,
                  y: icon.y + Math.sin(u * 9 + (k * Math.PI * 2) / 3) * icon.size * 0.6,
                }))
              : []
          return {
            her: { x: at, y: ground, pose: 'spell' },
            icons: hopping ? [{ slot: a, x: icon.x, y: icon.y - hop, angle: 0 }] : [],
            covered: hopping ? [a] : [],
            sparkles,
          }
        },
      })
      still('idle', 400)
      break
    }
    case 'carry': {
      // Lifts it up over her head, walks off with it, twirls, brings it back and puts it back.
      go(over(a))
      lift(a)
      const start = x
      const away = start + plan.side * 170 * scale
      go(away, [a])
      const spinAt = x
      const spinning = covered
      beats.push({
        ms: FIDGET_MS.twirl,
        at: (u) => ({
          her: { x: spinAt, y: ground, pose: 'twirl' },
          icons: [{ ...overhead(spinAt, a, u), angle: ease(u) * Math.PI * 4 }],
          covered: spinning,
          sparkles: [],
        }),
      })
      go(start, [a])
      lift(a, true)
      break
    }
    case 'juggle-icons': {
      // Three icons float up to her hands, she juggles them, and they float back down.
      go(over(1))
      const at = x
      const hands = [
        { x: at - pad + sprite * 0.4, y: ground - pad + sprite * 0.6 },
        { x: at - pad + sprite * 0.6, y: ground - pad + sprite * 0.6 },
      ]
      const high = 70 * scale
      const juggled = (u: number) =>
        [0, 1, 2].map((slot) => {
          const round = (u * 3 + slot / 3) % 1
          const arc = round < 0.62
          const v = arc ? round / 0.62 : (round - 0.62) / 0.38
          const [from, to] = arc ? [hands[0]!, hands[1]!] : [hands[1]!, hands[0]!]
          const up = (arc ? high : 10 * scale) * 4 * v * (1 - v)
          return {
            slot,
            x: lerp(from.x, to.x, v),
            y: lerp(from.y, to.y, v) - 8 * scale - up,
            angle: 0,
          }
        })
      const homes = [0, 1, 2].map((slot) => iconOf(slots[slot]!))
      const toHands = (down: boolean): Beat => ({
        ms: down ? REACTION_MS.lower : REACTION_MS.lift,
        at: (u) => {
          const v = ease(down ? 1 - u : u)
          const start = juggled(0)
          return {
            her: { x: at, y: ground, pose: down ? 'lower' : 'lift' },
            icons: start.map((icon, k) => ({
              ...icon,
              x: lerp(homes[k]!.x, icon.x, v),
              y: lerp(homes[k]!.y, icon.y, v),
            })),
            covered: [0, 1, 2],
            sparkles: [],
          }
        },
      })
      beats.push(toHands(false))
      beats.push({
        ms: REACTION_MS.toss,
        at: (u) => ({
          her: { x: at, y: ground, pose: 'toss' },
          icons: juggled(u),
          covered: [0, 1, 2],
          sparkles: [],
        }),
      })
      beats.push(toHands(true))
      break
    }
    case 'swap': {
      // A wave of her wand swaps two icons round; she looks guilty; another wave swaps them back.
      const left = iconOf(slots[0]!)
      const right = iconOf(slots[1]!)
      go((left.x + right.x) / 2 - size / 2)
      const at = x
      const swapping = (back: boolean): Beat => ({
        ms: FIDGET_MS.spell,
        at: (u) => {
          const v = ease(Math.min(1, Math.max(0, (u - 0.25) / 0.5)))
          const w = back ? 1 - v : v
          const arc = (height: number) => 4 * w * (1 - w) * height * scale
          return {
            her: { x: at, y: ground, pose: 'spell' },
            icons: [
              {
                slot: 0,
                x: lerp(left.x, right.x, w),
                y: lerp(left.y, right.y, w) - arc(42),
                angle: 0,
              },
              {
                slot: 1,
                x: lerp(right.x, left.x, w),
                y: lerp(right.y, left.y, w) - arc(20),
                angle: 0,
              },
            ],
            covered: [0, 1],
            sparkles:
              u > 0.2 && u < 0.8 ? [{ x: (left.x + right.x) / 2, y: left.y - 30 * scale * w }] : [],
          }
        },
      })
      beats.push(swapping(false))
      resting = [
        { slot: 0, x: right.x, y: right.y, angle: 0 },
        { slot: 1, x: left.x, y: left.y, angle: 0 },
      ]
      covered = [0, 1]
      still('guilty', REACTION_MS.guilty)
      beats.push(swapping(true))
      resting = []
      covered = []
      break
    }
    case 'perch': {
      // Hops down onto the icon, sits on it a while, and hops back up.
      go(over(a))
      const at = x
      const icon = iconOf(slots[a]!)
      const perched = icon.y - icon.size / 2 - size - pad + 3 * scale
      const hop = (down: boolean): Beat => ({
        ms: FIDGET_MS.hop,
        at: (u) => {
          const v = ease(Math.min(1, Math.max(0, (u - 0.25) / 0.45)))
          const w = down ? v : 1 - v
          const arc = 4 * v * (1 - v) * 14 * scale
          return {
            her: { x: at, y: lerp(ground, perched, w) - arc, pose: 'hop' },
            icons: [],
            covered: [],
            sparkles: [],
          }
        },
      })
      beats.push(hop(true))
      beats.push({
        ms: FIDGET_MS.sit,
        at: () => ({
          her: { x: at, y: perched, pose: 'sit' },
          icons: [],
          covered: [],
          sparkles: [],
        }),
      })
      beats.push(hop(false))
      break
    }
    case 'knock': {
      // She sneezes beside it, it goes flying and lands on the taskbar; she fetches it and puts it back.
      const icon = iconOf(slots[a]!)
      go(icon.x - size / 2 - plan.side * size * 0.32)
      const at = x
      const landX = Math.min(
        Math.max(icon.x + plan.side * 190 * scale, plan.minX + size / 2),
        plan.maxX + size / 2,
      )
      const landY = ground + size + pad - icon.size / 2
      const flight = (u: number): FlyingIcon => {
        const v = Math.min(1, u)
        const up = 4 * v * (1 - v) * 70 * scale
        return {
          slot: a,
          x: lerp(icon.x, landX, v),
          y: lerp(icon.y, landY, v) - up,
          angle: v * Math.PI * 3 * plan.side,
        }
      }
      const burstAt = 1300 / FIDGET_MS.sneeze
      beats.push({
        ms: FIDGET_MS.sneeze,
        at: (u) => {
          const out = u >= burstAt
          return {
            her: { x: at, y: ground, pose: 'sneeze' },
            icons: out ? [flight(((u - burstAt) * FIDGET_MS.sneeze) / 900)] : [],
            covered: out ? [a] : [],
            sparkles: [],
          }
        },
      })
      resting = [{ ...flight(1), angle: (Math.PI / 2) * plan.side }]
      covered = [a]
      go(landX - size / 2)
      // Lifting it from where it landed.
      const fetchAt = x
      beats.push({
        ms: REACTION_MS.lift,
        at: (u) => {
          const up = overhead(fetchAt, a, 0, false)
          const v = ease(u)
          return {
            her: { x: fetchAt, y: ground, pose: 'lift' },
            icons: [
              {
                slot: a,
                x: lerp(landX, up.x, v),
                y: lerp(landY, up.y, v),
                angle: (1 - v) * (Math.PI / 2) * plan.side,
              },
            ],
            covered: [a],
            sparkles: [],
          }
        },
      })
      resting = []
      go(over(a), [a])
      lift(a, true)
      break
    }
  }
  go(plan.from)
  return beats
}

const plans = new WeakMap<TrickPlan, Beat[]>()

/** How long a trick lasts altogether (ms). */
export function trickLength(plan: TrickPlan): number {
  return beatsFor(plan).reduce((total, beat) => total + beat.ms, 0)
}

function beatsFor(plan: TrickPlan): Beat[] {
  let beats = plans.get(plan)
  if (!beats) {
    beats = beatsOf(plan)
    plans.set(plan, beats)
  }
  return beats
}

/** The trick `t` ms in. */
export function trickFrame(plan: TrickPlan, t: number): TrickFrame {
  const beats = beatsFor(plan)
  let left = Math.max(0, t)
  for (const beat of beats) {
    if (left < beat.ms) return { ...beat.at(beat.ms > 0 ? left / beat.ms : 1), done: false }
    left -= beat.ms
  }
  return {
    her: { x: plan.from, y: plan.ground, pose: 'idle' },
    icons: [],
    covered: [],
    sparkles: [],
    done: true,
  }
}
