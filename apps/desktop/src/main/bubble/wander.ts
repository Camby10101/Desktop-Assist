import { FIDGETS, inSeason, TIMED, type Fidget } from '@shared/character'
import type { Point } from '@shared/geometry'

// What the character does on its own while nobody is using it, and how it falls when dropped.
// Positions along the taskbar are "insets": how far the character stands from its corner (0 is
// right in the corner, growing toward the middle of the screen).

export const WANDER = {
  /** How far from its corner the character wanders (DIP). */
  zone: 180,
  /** Walking speed (DIP per second). */
  walkSpeed: 80,
  /** Shorter walks aren't worth it. */
  minWalk: 40,
  /** The first thing it does after settling comes this long after (ms, from-to)... */
  firstDelay: [5000, 12000],
  /** ...and then one thing every so often. */
  delay: [8000, 20000],
  /** Fidgets only once it's been left alone this long (ms). */
  fidgetAfter: 30_000,
  /** Falling after a drop (DIP per second squared). */
  gravity: 2500,
} as const

/**
 * Throwing her: let go while the pointer's moving, she flies on with its speed (measured over the
 * last `sampleMs` before letting go; slower than `minSpeed`, DIP per second, she just drops, and
 * never faster than `maxSpeed`), falling under `gravity` (DIP per second squared: a little more than
 * a drop's, WANDER.gravity, so a throw doesn't float), keeping `bounce` of her speed off the sides
 * and top of her screen (a dull thud more than a bounce), until she lands on its taskbar. Landing at `splatSpeed` or
 * faster (as from a fall of a third of a screen or so, or a throw down) is a hard landing: she
 * goes splat.
 */
export const FLING = {
  sampleMs: 100,
  minSpeed: 350,
  maxSpeed: 4200,
  gravity: 3000,
  bounce: 0.35,
  splatSpeed: 1300,
} as const

/** Where the pointer was at a moment while she was carried (ms, and DIP). */
export interface PointerSample {
  t: number
  x: number
  y: number
}

/**
 * How fast the pointer was going as she was let go (DIP per second): from the earliest sample in
 * the last FLING.sampleMs before `now` to the latest, no faster than FLING.maxSpeed. Still if it
 * hadn't moved in that time, or there's too little to tell.
 */
export function releaseVelocity(samples: readonly PointerSample[], now: number): Point {
  const recent = samples.filter((s) => s.t >= now - FLING.sampleMs)
  const first = recent[0]
  const last = recent.at(-1)
  if (!first || !last || last.t - first.t < 20) return { x: 0, y: 0 }
  const seconds = (last.t - first.t) / 1000
  let x = (last.x - first.x) / seconds
  let y = (last.y - first.y) / seconds
  const speed = Math.hypot(x, y)
  if (speed > FLING.maxSpeed) {
    x *= FLING.maxSpeed / speed
    y *= FLING.maxSpeed / speed
  }
  return { x, y }
}

/** Where she is in the air (her box's top-left, DIP) and how fast she's going (DIP per second). */
export interface Flight {
  x: number
  y: number
  vx: number
  vy: number
}

/**
 * One frame of flying (`dtMs`): gravity (FLING.gravity) pulls her down; the sides of her screen (`minX`, `maxX`)
 * and its top (`minY`) turn her back, keeping FLING.bounce of her speed; at `floor` (where she
 * stands on the taskbar) she lands, and `impact` is how fast she was falling (DIP per second).
 */
export function flightStep(
  flight: Flight,
  dtMs: number,
  room: { minX: number; maxX: number; minY: number; floor: number },
): { flight: Flight; landed: boolean; impact: number } {
  const dt = Math.min(Math.max(dtMs, 0), 50) / 1000
  let { x, y, vx, vy } = flight
  vy += FLING.gravity * dt
  x += vx * dt
  y += vy * dt
  if (x < room.minX) {
    x = room.minX
    vx = Math.abs(vx) * FLING.bounce
  } else if (x > room.maxX) {
    x = room.maxX
    vx = -Math.abs(vx) * FLING.bounce
  }
  if (y < room.minY) {
    y = room.minY
    vy = Math.abs(vy) * FLING.bounce
  }
  if (y >= room.floor) {
    return { flight: { x, y: room.floor, vx: 0, vy: 0 }, landed: true, impact: Math.max(0, vy) }
  }
  return { flight: { x, y, vx, vy }, landed: false, impact: 0 }
}

/**
 * Her reactions to the pointer, looked at every `everyMs`: it startles her zipping past within
 * `zipNear` DIP of her middle (at her usual size) faster than `zipSpeed` DIP a second; and she
 * pounces at it when it's wiggled (`wiggles` turns back and forth, each at least `wiggleStep`
 * DIP) within `wiggleNear` of her, in `wiggleMs`. She answers `chance` of the time, and then not
 * again for `restMs`.
 */
export const POINTER = {
  everyMs: 50,
  zipNear: 110,
  zipSpeed: 2000,
  wiggleNear: 160,
  wiggles: 4,
  wiggleStep: 4,
  wiggleMs: 1200,
  chance: 0.6,
  restMs: 45_000,
} as const

/**
 * What she does about the pointer, from where it's been lately (`seen`, oldest first, DIP) and
 * where her middle is: `startle` if it just zipped past close to her, `pounce-left` or
 * `pounce-right` (toward it) if it's been wiggled near her, or null.
 */
export function pointerReaction(
  seen: readonly PointerSample[],
  her: Point,
  scale = 1,
): 'startle' | 'pounce-left' | 'pounce-right' | null {
  const last = seen.at(-1)
  const before = seen.at(-2)
  if (!last || !before) return null
  const dt = (last.t - before.t) / 1000
  if (dt > 0) {
    const speed = Math.hypot(last.x - before.x, last.y - before.y) / dt
    if (
      speed > POINTER.zipSpeed &&
      distanceToSegment(her, before, last) < POINTER.zipNear * scale
    ) {
      return 'startle'
    }
  }
  const near = seen.filter((s) => Math.hypot(s.x - her.x, s.y - her.y) < POINTER.wiggleNear * scale)
  if (near.length < POINTER.wiggles + 1 || near.length !== seen.length) return null
  let turns = 0
  let heading = 0
  for (let i = 1; i < near.length; i++) {
    const dx = near[i]!.x - near[i - 1]!.x
    if (Math.abs(dx) < POINTER.wiggleStep) continue
    const way = Math.sign(dx)
    if (heading !== 0 && way !== heading) turns++
    heading = way
  }
  if (turns < POINTER.wiggles) return null
  return last.x < her.x ? 'pounce-left' : 'pounce-right'
}

/** How far `p` is from the line from `a` to `b` (the nearest point of it). */
function distanceToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const length = dx * dx + dy * dy
  const t =
    length === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / length))
  return Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t))
}

/** How fast she's falling (DIP per second) when she lands after dropping `height` DIP. */
export const impactSpeed = (height: number): number =>
  Math.sqrt(2 * WANDER.gravity * Math.max(0, height))

/** Whether landing at `speed` (DIP per second) knocks her flat (see FLING.splatSpeed). */
export const isHardLanding = (speed: number): boolean => speed >= FLING.splatSpeed

export type Activity =
  | { kind: 'walk'; to: number }
  | { kind: 'fidget'; pose: Fidget }
  | { kind: 'perform'; name: PerformanceName }
  /** Nothing this time (she stands still, as asked in Settings). */
  | { kind: 'rest' }

/** What she may do on her own (Settings can turn either off): walk about, and fidget. */
export interface Pastimes {
  walk: boolean
  fidget: boolean
}

/**
 * How often a fidget comes up compared with the others, which count 1 each: the vision (the
 * company's logo coming down to her) is a rare treat, about a fifth as likely as any other.
 */
export const FIDGET_WEIGHT: Partial<Record<Fidget, number>> = { vision: 0.2 }

/**
 * Her performances: longer things she does that move her about and draw outside her own window
 * (see Performer in BubbleController.ts): watching the pointer; tricks with the taskbar's icons
 * (carrying one about, juggling three, swapping two as a prank, perching on one, sneezing one
 * flying, a wand tap); peeking round a window; waving through a portal on top of a window; and a visit from her
 * familiar.
 */
export const PERFORMANCES = [
  'watch',
  'carry',
  'juggle-icons',
  'swap',
  'perch',
  'knock',
  'tap',
  'peek',
  'portal',
  'familiar',
] as const
export type PerformanceName = (typeof PERFORMANCES)[number]

/**
 * How likely each performance is when it can be done, against 1 for a habit: the taskbar tricks
 * and watching the pointer are rare (a tenth as likely), the rest as likely as a habit.
 */
export const PERFORMANCE_WEIGHT: Record<PerformanceName, number> = {
  watch: 0.1,
  carry: 0.1,
  'juggle-icons': 0.1,
  swap: 0.1,
  perch: 0.1,
  knock: 0.1,
  tap: 0.1,
  peek: 1,
  portal: 1,
  familiar: 1,
}

/** Performances that don't move her from where she stands (so they're fine when she's to stand still). */
export const STAYING_PUT: readonly PerformanceName[] = ['watch', 'familiar']

/**
 * What she might do besides her habits: the time (`when`, local), for the timed habits (TIMED;
 * without it they never come up), and the performances that can be done just now.
 */
export interface Choices {
  when?: Date
  performances?: readonly PerformanceName[]
}

/** How long until the next thing the character does on its own (ms). */
export function activityDelay(random: () => number, first: boolean): number {
  const [from, to] = first ? WANDER.firstDelay : WANDER.delay
  return from + random() * (to - from)
}

/**
 * What to do next, after being left alone for `idleMs`, standing `inset` from her corner with
 * room to wander up to `zone` (WANDER.zone, or less on a narrow screen). Until she's been alone a
 * while she only strolls about; after that, more often than not she does one of her fidgets
 * instead, any but the one she did last (`last`), so she doesn't repeat herself, picked at random
 * by FIDGET_WEIGHT (so the vision is rare). The timed habits come up only in their time
 * (`choices.when`, see TIMED), with their own weights; and the performances that can be done
 * (`choices.performances`) are in the draw too, by PERFORMANCE_WEIGHT. Without walking
 * (`allowed`), the walks become rests; without fidgets, she only ever walks.
 */
export function nextActivity(
  idleMs: number,
  inset: number,
  zone: number,
  random: () => number,
  last?: Fidget | PerformanceName,
  allowed: Pastimes = { walk: true, fidget: true },
  choices: Choices = {},
): Activity {
  if (allowed.fidget && idleMs >= WANDER.fidgetAfter && random() < 0.6) {
    const { when } = choices
    const options: { activity: Activity; weight: number }[] = [
      ...FIDGETS.filter((fidget) => fidget !== last).flatMap((fidget) => {
        if (!(fidget in TIMED)) {
          return [
            {
              activity: { kind: 'fidget', pose: fidget } as const,
              weight: FIDGET_WEIGHT[fidget] ?? 1,
            },
          ]
        }
        if (!when || !inSeason(fidget, when)) return []
        const weight = TIMED[fidget as keyof typeof TIMED].weight
        return [{ activity: { kind: 'fidget', pose: fidget } as const, weight }]
      }),
      ...(choices.performances ?? [])
        .filter((name) => name !== last)
        .map((name) => ({
          activity: { kind: 'perform', name } as const,
          weight: PERFORMANCE_WEIGHT[name],
        })),
    ]
    // A point along all the weights laid end to end; the one whose stretch it falls in.
    let roll = random() * options.reduce((total, option) => total + option.weight, 0)
    for (const option of options) {
      roll -= option.weight
      if (roll < 0) return option.activity
    }
    return options.at(-1)!.activity
  }
  if (!allowed.walk) return { kind: 'rest' }
  return { kind: 'walk', to: walkTarget(inset, zone, random()) }
}

/**
 * Somewhere else in the zone to walk to, at least WANDER.minWalk away when the zone allows: `roll`
 * (0–1) picks the spot among those that are far enough.
 */
export function walkTarget(inset: number, zone: number, roll: number): number {
  const from = Math.min(Math.max(inset, 0), zone)
  // The stretches of the zone far enough away: before the character, and after it.
  const before = Math.max(0, from - WANDER.minWalk)
  const after = Math.max(0, zone - (from + WANDER.minWalk))
  if (before + after === 0) return zone - from > from ? zone : 0 // a tiny zone: the far end
  const along = roll * (before + after)
  return along < before ? along : from + WANDER.minWalk + (along - before)
}

/**
 * One frame of walking: `dtMs` closer to `to` at `speed` (DIP per second; WANDER.walkSpeed at her
 * usual size), never past it.
 */
export function walkStep(
  from: number,
  to: number,
  dtMs: number,
  speed: number = WANDER.walkSpeed,
): number {
  const step = (speed * Math.min(Math.max(dtMs, 0), 100)) / 1000
  return to > from ? Math.min(to, from + step) : Math.max(to, from - step)
}

/**
 * How long the fall from `from` to `to` takes (ms): as long as gravity takes to drop that far, or
 * a short hop when it was dropped below where it stands (over the taskbar).
 */
export function fallDuration(from: Point, to: Point): number {
  const drop = to.y - from.y
  if (drop <= 0) return 200
  return Math.max(150, Math.sqrt((2 * drop) / WANDER.gravity) * 1000)
}

/** Position at progress `t` (0–1) of the fall: speeding up as it falls, like a dropped thing. */
export function fallPosition(from: Point, to: Point, t: number): Point {
  const progress = Math.min(Math.max(t, 0), 1)
  const falling = to.y > from.y
  const eased = falling ? progress ** 2 : 1 - (1 - progress) ** 2
  return { x: from.x + (to.x - from.x) * progress, y: from.y + (to.y - from.y) * eased }
}
