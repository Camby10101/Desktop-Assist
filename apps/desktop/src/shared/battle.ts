import { FIDGET_MS, REACTION_MS, type Pose } from './character'
import { bubbleMetrics, type Point, type Rect } from './geometry'

// Her battle (a rare performance: see wander.ts PERFORMANCES): three monsters of my own design
// come along the taskbar from the far side of her screen, one after another; she faces them and
// casts a magic bolt at each as it comes up, and each one hit is knocked tumbling back off the
// screen the way it came; then she gives a little hop of triumph. It's a timeline worked out the
// same way, from the same plan and the same clock, by the main process (her poses: she stays
// where she stands) and by the battle's page (the monsters and her spells, in a see-through window
// along the bottom of her screen). Everything is in DIPs on the screen.

export const MONSTER_KINDS = ['slime', 'toadstool', 'imp'] as const
export type MonsterKind = (typeof MONSTER_KINDS)[number]

/**
 * Each monster's picture (pixels at her usual size, a DIP each, more when she's bigger), and
 * whether it flies (the imp, a little above the taskbar) rather than walks.
 */
export const MONSTER_SIZE: Record<MonsterKind, { width: number; height: number; flies: boolean }> =
  {
    slime: { width: 22, height: 14, flies: false },
    toadstool: { width: 18, height: 20, flies: false },
    imp: { width: 22, height: 15, flies: true },
  }

/**
 * The battle's timetable (ms) and sizes (DIP at her usual size): she's startled as the first
 * comes on (`noticeMs`); they come on `gapMs` apart, each taking `walkMs` or a little more to
 * reach where it stops; a cast takes `castMs`, the bolt leaving her
 * hand `launchMs` into it and flying at `boltSpeed`; its burst lasts `burstMs`; a monster hit is
 * knocked off the screen in `flyMs`, `knockHeight` up at the top of its tumble; the imp flies
 * `flyHeight` above the taskbar; then her hop of triumph.
 */
export const BATTLE = {
  noticeMs: REACTION_MS.startle,
  gapMs: 1_900,
  walkMs: 3_000,
  castMs: 700,
  launchMs: 260,
  boltSpeed: 900,
  burstMs: 450,
  flyMs: 1_100,
  knockHeight: 40,
  flyHeight: 26,
  cheerMs: FIDGET_MS.hop,
} as const

/** What a battle is worked out from (see planBattle). */
export interface BattlePlan {
  /** How big she is (1 is her usual size), for sizes and distances. */
  scale: number
  /** Her box's top-left (it doesn't move) and its size. */
  her: Point
  size: number
  /** The top of the taskbar: where her feet are, and the monsters'. */
  ground: number
  /** The side they come from, the far side of her screen: 1 the right, -1 the left. */
  side: 1 | -1
  /** Just off the screen on that side: where they come on, and are knocked off to. */
  edge: number
  /**
   * Each monster, in the order they come: what it is, how long it takes to come on (ms), and where
   * its middle is when it stops to face her.
   */
  monsters: { kind: MonsterKind; walk: number; stop: number }[]
}

/** A battle for her where she stands: the monsters from the far side of her screen, in a random order. */
export function planBattle(
  standing: { workArea: Rect; box: Point; scale: number },
  random: () => number,
): BattlePlan {
  const { workArea: area, box, scale } = standing
  const { size, pad } = bubbleMetrics(scale)
  const middle = box.x + size / 2
  const side = middle > area.x + area.width / 2 ? -1 : 1
  const edge = side === 1 ? area.x + area.width + 40 * scale : area.x - 40 * scale
  const kinds = [...MONSTER_KINDS].sort(() => random() - 0.5)
  const monsters = kinds.map((kind, k) => {
    const far = (150 + k * 42 + random() * 30) * scale
    // On the screen, with room for it.
    const stop =
      side === 1
        ? Math.min(middle + far, area.x + area.width - MONSTER_SIZE[kind].width * scale)
        : Math.max(middle - far, area.x + MONSTER_SIZE[kind].width * scale)
    // However far it is, it comes on in a few seconds (the imp, flying, a little quicker).
    const walk = (BATTLE.walkMs + random() * 1_200) * (MONSTER_SIZE[kind].flies ? 0.8 : 1)
    return { kind, walk, stop }
  })
  return {
    scale,
    her: { x: box.x, y: box.y },
    size,
    ground: box.y + size + pad,
    side,
    edge,
    monsters,
  }
}

/** Where her hand is as she casts (the bolts start there): out in front of her, toward them. */
export function wandAt(plan: BattlePlan): Point {
  return {
    x: plan.her.x + plan.size / 2 + plan.side * plan.size * 0.3,
    y: plan.her.y + plan.size * 0.46,
  }
}

/** Where a monster is hit: its middle, standing (or flying) where it stopped. */
function targetOf(plan: BattlePlan, k: number): Point {
  const monster = plan.monsters[k]!
  const shape = MONSTER_SIZE[monster.kind]
  const lift = shape.flies ? BATTLE.flyHeight * plan.scale : 0
  return { x: monster.stop, y: plan.ground - lift - (shape.height * plan.scale) / 2 }
}

/** Each monster's moments (ms): on, at its stop, her cast at it, the bolt away, hit, and gone. */
interface Moments {
  enter: number
  arrive: number
  cast: number
  launch: number
  hit: number
  gone: number
}

const timetables = new WeakMap<BattlePlan, Moments[]>()

function momentsOf(plan: BattlePlan): Moments[] {
  let moments = timetables.get(plan)
  if (moments) return moments
  const wand = wandAt(plan)
  let free = BATTLE.noticeMs // when she can cast next
  moments = plan.monsters.map((monster, k) => {
    const enter = BATTLE.noticeMs * 0.5 + k * BATTLE.gapMs
    const arrive = enter + monster.walk
    const cast = Math.max(arrive, free)
    free = cast + BATTLE.castMs
    const launch = cast + BATTLE.launchMs
    const target = targetOf(plan, k)
    const flight =
      (Math.hypot(target.x - wand.x, target.y - wand.y) / (BATTLE.boltSpeed * plan.scale)) * 1000
    const hit = launch + flight
    return { enter, arrive, cast, launch, hit, gone: hit + BATTLE.flyMs }
  })
  timetables.set(plan, moments)
  return moments
}

/** How long the battle lasts (ms): until the last monster's gone and her hop's over. */
export function battleLength(plan: BattlePlan): number {
  const last = Math.max(...momentsOf(plan).map((m) => m.gone))
  return last + 300 + BATTLE.cheerMs
}

/** A monster at a moment: what it is, where (its middle, and its feet), which way, and how. */
export interface MonsterNow {
  kind: MonsterKind
  x: number
  y: number
  facing: 'left' | 'right'
  /** Coming on (walking or flying), waiting where it stopped, or knocked back (turning `spin`). */
  state: 'coming' | 'waiting' | 'knocked'
  spin: number
}

/** A moment of the battle. */
export interface BattleFrame {
  /** Her pose (she stays where she stands). */
  her: Pose
  monsters: MonsterNow[]
  /** Her bolts in flight (their middles) and which way they're going (1 right, -1 left). */
  bolts: { x: number; y: number; way: 1 | -1 }[]
  /** Where a bolt hit, and how far through its burst (0 to 1). */
  bursts: { x: number; y: number; age: number }[]
  done: boolean
}

/** The battle `t` ms in. */
export function battleFrame(plan: BattlePlan, t: number): BattleFrame {
  const moments = momentsOf(plan)
  const way = plan.side === 1 ? 'right' : 'left'
  const done = t >= battleLength(plan)
  const lastGone = Math.max(...moments.map((m) => m.gone))
  const casting = moments.some((m) => t >= m.cast && t < m.cast + BATTLE.castMs)
  const her: Pose = done
    ? 'idle'
    : t < BATTLE.noticeMs
      ? 'startle'
      : casting
        ? `cast-${way}`
        : t >= lastGone + 300
          ? 'hop'
          : `ready-${way}`
  const monsters: MonsterNow[] = []
  const bolts: BattleFrame['bolts'] = []
  const bursts: BattleFrame['bursts'] = []
  const wand = wandAt(plan)
  const toward = plan.side === 1 ? 'left' : 'right'
  moments.forEach((m, k) => {
    const monster = plan.monsters[k]!
    const shape = MONSTER_SIZE[monster.kind]
    const lift = shape.flies ? BATTLE.flyHeight * plan.scale : 0
    if (t >= m.enter && t < m.gone) {
      if (t < m.hit) {
        const coming = t < m.arrive
        const u = coming ? (t - m.enter) / (m.arrive - m.enter) : 1
        monsters.push({
          kind: monster.kind,
          x: plan.edge + (monster.stop - plan.edge) * u,
          y: plan.ground - lift - (shape.flies ? Math.sin(t / 160) * 2 * plan.scale : 0),
          facing: toward,
          state: coming ? 'coming' : 'waiting',
          spin: 0,
        })
      } else {
        // Knocked back the way it came, tumbling, in an arc, off the screen.
        const u = (t - m.hit) / BATTLE.flyMs
        monsters.push({
          kind: monster.kind,
          x: monster.stop + (plan.edge - monster.stop) * u,
          y: plan.ground - lift - BATTLE.knockHeight * plan.scale * 4 * u * (1 - u),
          facing: toward,
          state: 'knocked',
          spin: u * Math.PI * 3 * plan.side,
        })
      }
    }
    if (t >= m.launch && t < m.hit) {
      const target = targetOf(plan, k)
      const u = (t - m.launch) / (m.hit - m.launch)
      bolts.push({
        x: wand.x + (target.x - wand.x) * u,
        y: wand.y + (target.y - wand.y) * u,
        way: plan.side,
      })
    }
    if (t >= m.hit && t < m.hit + BATTLE.burstMs) {
      const target = targetOf(plan, k)
      bursts.push({ x: target.x, y: target.y, age: (t - m.hit) / BATTLE.burstMs })
    }
  })
  return { her, monsters, bolts, bursts, done }
}
