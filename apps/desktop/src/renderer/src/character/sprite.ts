import { FIDGET_MS, type Pose as Name } from '@shared/character'
import {
  BUBBLES,
  draw,
  GRID,
  HEADROOM,
  JUGGLE,
  LEG_LENGTH,
  wispAt,
  type Arm,
  type Leg,
  type Pose,
} from './rig'

// The character's animations: for each pose, a list of frames drawn by the rig (rig.ts) from key
// poses and the in-betweens eased between them. She's an original design: an elf mage with long
// pointed ears, long silver-white hair, amber eyes, a wide-brimmed crooked hat and a
// long robe in the tenant's accent colour. Frames are drawn the first time a pose is needed, then
// kept.

/**
 * The grid's size in pixels: 96 wide, and 96 tall below the headroom, filling the bubble's window,
 * one pixel a DIP at her usual size (more at a bigger size; see CHARACTER_SIZES).
 */
export const SPRITE_SIZE = GRID
/** Rows above the grid, for her hat when she rises: a frame is this much taller than it's wide. */
export const SPRITE_HEADROOM = HEADROOM

/** Each letter's colour, as a CSS class (character.css): robe and hat follow the accent colour. */
export const PALETTE: Record<string, string> = {
  // Hair, silver-white: outline, shadow, base, light, shine.
  O: 'px-hair-line',
  D: 'px-hair-shade',
  h: 'px-hair',
  l: 'px-hair-light',
  L: 'px-hair-shine',
  // Skin: outline, shadow, base, light, blush.
  K: 'px-skin-line',
  S: 'px-skin-shade',
  s: 'px-skin',
  z: 'px-skin-light',
  c: 'px-blush',
  // Eyes: lashes and lids, the iris dark to light (amber), a white glint; the mouth.
  e: 'px-lash',
  i: 'px-iris-dark',
  I: 'px-iris',
  j: 'px-iris-light',
  w: 'px-white',
  m: 'px-mouth',
  // The robe: outline, shadow, base, light (all mixed from the accent colour).
  q: 'px-robe-line',
  A: 'px-robe-shade',
  a: 'px-robe',
  v: 'px-robe-light',
  // The robe's silver trim, and the gem of its brooch.
  f: 'px-trim',
  F: 'px-trim-shade',
  G: 'px-gem',
  // Gold embroidery and buckles, and its shade.
  Y: 'px-gold',
  k: 'px-gold-shade',
  // Her hat (and her spellbook's cover): a deep shade of the accent colour.
  n: 'px-hat',
  N: 'px-hat-shade',
  g: 'px-hat-light',
  // Stockings and boots, with one dark outline.
  u: 'px-clothes-line',
  o: 'px-stocking',
  Q: 'px-stocking-shade',
  b: 'px-boot',
  B: 'px-boot-shade',
  y: 'px-boot-light',
  x: 'px-shadow',
}

/**
 * A frame as rows of letters (SPRITE_SIZE wide, SPRITE_SIZE + SPRITE_HEADROOM tall, the headroom
 * rows first), and how long it shows.
 */
export interface Frame {
  rows: string[]
  ms: number
}

/** A key pose and how long it shows. */
interface Key {
  pose: Pose
  ms: number
}

// ------------------------------------------------------------------------------------- tweening

/** Slow in, slow out. */
const smooth = (t: number) => t * t * (3 - 2 * t)
const lerp = (a = 0, b = 0, t: number) => a + (b - a) * t
const mixArm = (a: Arm, b: Arm, t: number): Arm => ({
  shoulder: lerp(a.shoulder, b.shoulder, t),
  elbow: lerp(a.elbow, b.elbow, t),
})
const mixLeg = (a: Leg, b: Leg, t: number): Leg => ({
  hip: lerp(a.hip, b.hip, t),
  knee: lerp(a.knee, b.knee, t),
})

const ARM_DOWN: Arm = { shoulder: 0.08, elbow: 0.04 }
const LEG_STAND: Leg = { hip: 0, knee: 0 }

/** Part of the way from pose `a` to pose `b`: numbers in between, the rest from the nearer one. */
function mix(a: Pose, b: Pose, t: number): Pose {
  const [an = ARM_DOWN, af = ARM_DOWN] = a.arms ?? []
  const [bn = ARM_DOWN, bf = ARM_DOWN] = b.arms ?? []
  const [ln = LEG_STAND, lf = LEG_STAND] = a.legs ?? []
  const [mn = LEG_STAND, mf = LEG_STAND] = b.legs ?? []
  const near = t < 0.5 ? a : b
  return {
    ...near,
    view: a.view,
    x: lerp(a.x, b.x, t),
    y: lerp(a.y, b.y, t),
    lean: lerp(a.lean, b.lean, t),
    tilt: lerp(a.tilt, b.tilt, t),
    look: lerp(a.look, b.look, t),
    wind: lerp(a.wind, b.wind, t),
    lift: lerp(a.lift, b.lift, t),
    rune: lerp(a.rune, b.rune, t),
    spin: lerp(a.spin, b.spin, t),
    spread: lerp(a.spread, b.spread, t),
    burst: lerp(a.burst, b.burst, t),
    arms: [mixArm(an, bn, t), mixArm(af, bf, t)],
    legs: [mixLeg(ln, mn, t), mixLeg(lf, mf, t)],
  }
}

/** In-betweens come about this often (ms): 25 frames a second. */
const FRAME_MS = 40

/**
 * Frames easing from `a` to `b` (ending on `b`) over `ms`: one every FRAME_MS or so, their times
 * adding up to exactly `ms`.
 */
function tween(a: Pose, b: Pose, ms: number): Key[] {
  const steps = Math.max(1, Math.round(ms / FRAME_MS))
  return Array.from({ length: steps }, (_, i) => ({
    pose: mix(a, b, smooth((i + 1) / steps)),
    ms: Math.round(((i + 1) * ms) / steps) - Math.round((i * ms) / steps),
  }))
}

const hold = (pose: Pose, ms: number): Key[] => [{ pose, ms }]

/**
 * Legs bent so her feet stay on the ground with her hips `depth` pixels lower: the thigh and shin
 * at equal and opposite angles (outward from the front, forward side on).
 */
function crouch(depth: number): [Leg, Leg] {
  const legs = LEG_LENGTH * 2
  const angle = Math.acos(Math.min(1, (legs - depth) / legs))
  const leg = { hip: angle, knee: angle * 2 }
  return [leg, leg]
}

// ----------------------------------------------------------------------------------- the poses

const FRONT: Pose = { view: 'front' }
const DIAGONAL: Pose = { view: 'diagonal' }

/** Standing, breathing (a pixel lower on the out-breath), her hair stirring; a blink. */
function idle(): Key[] {
  return Array.from({ length: 32 }, (_, i) => {
    const phase = (i / 32) * Math.PI * 2
    const breath = (1 - Math.cos(phase)) / 2
    const arm = { shoulder: 0.07 + breath * 0.04, elbow: 0.05 }
    return {
      pose: {
        view: 'front',
        y: Math.round(breath),
        wind: Math.sin(phase + 1) * 0.8,
        arms: [arm, arm],
        face: i === 21 || i === 22 ? 'blink' : 'neutral',
      },
      ms: 75,
    }
  })
}

/**
 * Walking, side on, facing right: twelve frames, two steps. Each leg swings forward with its knee
 * bent, plants and pushes back; the arms swing against the legs; her body rises as her legs pass;
 * her hair trails behind her, a ripple running down it once a stride, so it flows; and she leaves a
 * trail of little sparkles on the ground behind her.
 */
function walk(): Key[] {
  return Array.from({ length: 12 }, (_, i) => {
    const phase = (i / 12) * Math.PI * 2
    const swing = Math.sin(phase)
    const forward = Math.cos(phase)
    return {
      pose: {
        view: 'side',
        y: Math.round(-1.5 * forward ** 2),
        lean: 0.07,
        wind: -2 + Math.sin(phase - 0.8) * 0.4,
        flow: phase,
        trail: i / 12,
        legs: [
          { hip: 0.45 * swing, knee: 0.12 + 0.65 * Math.max(0, forward) ** 1.5 },
          { hip: -0.45 * swing, knee: 0.12 + 0.65 * Math.max(0, -forward) ** 1.5 },
        ],
        arms: [
          { shoulder: -0.4 * swing, elbow: 0.25 + 0.2 * Math.max(0, -swing) },
          { shoulder: 0.4 * swing, elbow: 0.25 + 0.2 * Math.max(0, swing) },
        ],
      },
      ms: 55,
    }
  })
}

/** A hop: crouch, spring up with her arms flung up, float, fall, land with a bounce. */
function hop(): Key[] {
  const up: [Arm, Arm] = [
    { shoulder: 2.4, elbow: 0.2 },
    { shoulder: 2.4, elbow: 0.2 },
  ]
  const tuck: [Leg, Leg] = [
    { hip: 0.2, knee: 0.55 },
    { hip: 0.2, knee: 0.55 },
  ]
  const low: Pose = {
    view: 'front',
    y: 3,
    legs: crouch(3),
    arms: [
      { shoulder: -0.2, elbow: 0.3 },
      { shoulder: -0.2, elbow: 0.3 },
    ],
  }
  const launch: Pose = { view: 'front', y: -3, arms: up, face: 'happy', lift: -2 }
  const rise: Pose = { view: 'front', y: -5, arms: up, legs: tuck, face: 'happy', lift: -1 }
  const apex: Pose = { view: 'front', y: -6, arms: up, legs: tuck, face: 'happy', lift: 1 }
  const float: Pose = { ...apex, lift: 2 }
  const fall: Pose = { view: 'front', y: -4, arms: up, face: 'happy', lift: 3 }
  const touch: Pose = { view: 'front', y: -1, arms: up, face: 'happy', lift: 3 }
  const land: Pose = {
    view: 'front',
    y: 3,
    legs: crouch(3),
    arms: [
      { shoulder: 0.9, elbow: 0.2 },
      { shoulder: 0.9, elbow: 0.2 },
    ],
    face: 'happy',
  }
  const recover: Pose = {
    view: 'front',
    y: 1,
    legs: crouch(1),
    arms: [
      { shoulder: 0.4, elbow: 0.1 },
      { shoulder: 0.4, elbow: 0.1 },
    ],
  }
  return [
    ...hold(FRONT, 60),
    ...tween(FRONT, low, 140),
    ...tween(low, launch, 80),
    ...tween(launch, rise, 90),
    ...tween(rise, apex, 120),
    ...tween(apex, float, 100),
    ...tween(float, fall, 80),
    ...tween(fall, touch, 70),
    ...tween(touch, land, 130),
    ...tween(land, recover, 110),
    ...tween(recover, FRONT, 140),
    ...hold(FRONT, 80),
  ]
}

/** A wave, seen diagonally: her hand up, waving to and fro, head tilted, smiling. */
function wave(): Key[] {
  const hand = (elbow: number): Pose => ({
    view: 'diagonal',
    tilt: 0.08,
    face: 'happy',
    arms: [{ shoulder: 3.2, elbow }, ARM_DOWN],
  })
  // The upper arm raised out in front, the forearm upright, swinging to and fro: four waves.
  const waving: Key[] = Array.from({ length: 24 }, (_, i) => ({
    pose: hand(0.1 + 0.3 * Math.sin((i / 6) * Math.PI * 2)),
    ms: 50,
  }))
  return [
    ...hold(DIAGONAL, 100),
    ...tween(DIAGONAL, hand(0.1), 180),
    ...waving,
    ...tween(hand(0.1), DIAGONAL, 180),
    ...hold(DIAGONAL, 340),
  ]
}

/** A stretch: arms up, a yawn, a lean one way and the other, arms down. */
function stretch(): Key[] {
  const up = (lean: number, face: Pose['face']): Pose => ({
    view: 'front',
    y: -1,
    lean,
    face,
    arms: [
      { shoulder: 2.85, elbow: 0.12 },
      { shoulder: 2.85, elbow: 0.12 },
    ],
  })
  return [
    ...tween(FRONT, up(0, 'blink'), 320),
    ...hold(up(0, 'yawn'), 400),
    ...tween(up(0, 'yawn'), up(0.14, 'blink'), 300),
    ...hold(up(0.14, 'blink'), 200),
    ...tween(up(0.14, 'blink'), up(-0.14, 'blink'), 300),
    ...hold(up(-0.14, 'blink'), 200),
    ...tween(up(-0.14, 'blink'), up(0, 'neutral'), 240),
    ...tween(up(0, 'neutral'), FRONT, 320),
    ...hold(FRONT, 120),
  ]
}

/** A sip of tea, seen diagonally: the cup up to her mouth, a sip, down, a contented smile. */
function sip(): Key[] {
  const low = (face: Pose['face'] = 'neutral'): Pose => ({
    view: 'diagonal',
    prop: 'cup',
    face,
    arms: [
      { shoulder: 0.35, elbow: 1.75 },
      { shoulder: 0.15, elbow: 0.3 },
    ],
  })
  const drinking = (tilt: number): Pose => ({
    view: 'diagonal',
    prop: 'cup',
    face: 'sip',
    tilt,
    arms: [
      { shoulder: 0.65, elbow: 2.65 },
      { shoulder: 0.15, elbow: 0.3 },
    ],
  })
  return [
    ...hold(low(), 300),
    ...tween(low(), drinking(-0.1), 280),
    ...tween(drinking(-0.1), drinking(-0.16), 800),
    ...tween(drinking(-0.16), low('happy'), 280),
    ...hold(low('happy'), 700),
    ...hold(low('blink'), 120),
    ...hold(low(), 300),
    ...tween(low(), { ...DIAGONAL, prop: undefined }, 240),
    ...hold(DIAGONAL, 180),
  ]
}

/** Reading her spellbook, seen diagonally: head down, turning a page, a smile at something. */
function read(): Key[] {
  const reading = (turn: number, face: Pose['face'] = 'down'): Pose => ({
    view: 'diagonal',
    prop: 'book',
    face,
    tilt: 0.12,
    arms: [
      { shoulder: 0.35, elbow: 1.7 },
      { shoulder: 0.45, elbow: 1.5 + turn },
    ],
  })
  // Turning a page: her far hand sweeps across and back.
  const turning = [
    ...tween(reading(0), reading(0.35), 240),
    ...tween(reading(0.35), reading(0), 240),
  ]
  return [
    ...tween({ ...DIAGONAL, prop: 'book' }, reading(0), 240),
    ...hold(reading(0), 600),
    ...turning,
    ...hold(reading(0), 500),
    ...hold(reading(0, 'happy'), 600),
    ...hold(reading(0, 'blink'), 120),
    ...hold(reading(0), 300),
    ...turning,
    ...hold(reading(0), 200),
    ...tween(reading(0), { ...DIAGONAL, prop: undefined }, 240),
    ...hold(DIAGONAL, 240),
  ]
}

/** A little spell: her hand up, sparkles circling it, then gone with a smile. */
function spell(): Key[] {
  const casting = (sparkle: number, face: Pose['face'] = 'neutral'): Pose => ({
    view: 'diagonal',
    face,
    tilt: -0.05,
    sparkle,
    arms: [
      { shoulder: 1.6, elbow: 0.6 },
      { shoulder: 0.15, elbow: 0.2 },
    ],
  })
  const circling: Key[] = Array.from({ length: 24 }, (_, i) => ({
    pose: casting(0.05 + i / 24, i > 16 ? 'happy' : 'neutral'),
    ms: 55,
  }))
  return [
    ...tween(DIAGONAL, casting(0), 240),
    ...circling,
    ...hold(casting(0, 'happy'), 400),
    ...tween(casting(0, 'happy'), DIAGONAL, 240),
    ...hold(DIAGONAL, 200),
  ]
}

/**
 * A vision, from the front, in time with the light and the logo above her (VISION): as the light
 * appears she looks up, wide-eyed, her hands lifting a little; as the logo arrives she smiles and
 * her arms open, and she gazes up at it while it hovers, blinking once; she watches it rise away,
 * then settles and blinks.
 */
function vision(): Key[] {
  const looking = (face: Pose['face'], out: number, i = 0): Pose => {
    // A breath every second or so, so she isn't frozen while she watches.
    const breath = Math.sin((i / 25) * Math.PI * 2) * 0.03
    const arm = { shoulder: 0.1 + out * 0.35 + breath, elbow: out * 0.5 }
    return { view: 'front', face, arms: [arm, arm] }
  }
  // Frames about every FRAME_MS, their times adding up to exactly `ms` (as tween's do).
  const watching = (face: Pose['face'], out: number, ms: number): Key[] => {
    const steps = Math.round(ms / FRAME_MS)
    return Array.from({ length: steps }, (_, i) => ({
      pose: looking(face, out, i),
      ms: Math.round(((i + 1) * ms) / steps) - Math.round((i * ms) / steps),
    }))
  }
  return [
    ...hold(FRONT, 400),
    ...tween(FRONT, looking('awe', 0.4), 320),
    ...watching('awe', 0.4, 1100),
    ...tween(looking('awe', 0.4), looking('up', 0.7), 400),
    ...watching('up', 0.7, 2000),
    ...hold({ ...looking('up', 0.7), face: 'blink' }, 120),
    ...watching('up', 0.7, 2480),
    ...tween(looking('up', 0.7), looking('up', 0.3), 1200),
    ...tween(looking('up', 0.3), FRONT, 400),
    ...hold({ ...FRONT, face: 'blink' }, 120),
    ...hold(FRONT, 60),
  ]
}

/**
 * Levitating: eyes shut, her arms drift out, a magic circle opens on the ground and she floats up
 * over it, her hair and robe lifting; she hovers, bobbing, smiling, the runes turning and sparks
 * rising; then she sinks, lands with a little bend of the knees, and the circle fades.
 */
function levitate(): Key[] {
  const floating = (
    y: number,
    rune: number,
    out: number,
    face: Pose['face'],
    spin: number,
    lift = 0,
    wind = 0,
  ): Pose => {
    const arm = { shoulder: 0.1 + out * 0.45, elbow: out * 0.35 }
    return { view: 'front', y, rune, spin, lift, wind, face, arms: [arm, arm] }
  }
  const gather = floating(0, 0.5, 0.5, 'blink', 0)
  const risen = floating(-7, 1, 1, 'blink', 0.15, 2.5)
  // Hovering: a pixel up and down, the robe fluttering, a smile in the middle; one turn of runes.
  const hovering: Key[] = Array.from({ length: 40 }, (_, i) => {
    const phase = (i / 40) * Math.PI * 2
    const face = i >= 14 && i < 30 ? 'happy' : 'blink'
    return {
      pose: floating(
        -7 - Math.round(Math.sin(phase)),
        1,
        1,
        face,
        0.15 + i / 40,
        2.5 + Math.sin(phase) * 0.5,
        Math.sin(phase * 2) * 1.2,
      ),
      ms: 40,
    }
  })
  const last = hovering.at(-1)!.pose
  const sunk = floating(0, 0.4, 0.5, 'blink', 1.3, 0.5)
  const land: Pose = { ...floating(2, 0, 0.3, 'neutral', 1.4), legs: crouch(2) }
  return [
    ...hold(FRONT, 120),
    ...tween(FRONT, gather, 320),
    ...tween(gather, risen, 600),
    ...hovering,
    ...tween(last, sunk, 480),
    ...tween(sunk, land, 160),
    ...tween(land, FRONT, 200),
    ...hold(FRONT, 120),
  ]
}

/** Sitting on the taskbar, her robe spread round her, swaying gently, looking about, then up again. */
function sit(): Key[] {
  const hug: [Arm, Arm] = [
    { shoulder: 0.55, elbow: -1.15 },
    { shoulder: 0.55, elbow: -1.15 },
  ]
  const sitting = (i: number): Pose => {
    const phase = (i / 46) * Math.PI * 4
    return {
      view: 'front',
      sitting: true,
      x: Math.round(Math.sin(phase)),
      tilt: Math.sin(phase) * 0.06,
      wind: Math.sin(phase) * 1.2,
      arms: hug,
      legs: [
        { hip: 0.3 + 0.3 * Math.sin(phase), knee: 0.3 },
        { hip: 0.3 + 0.3 * Math.sin(phase), knee: 0.3 },
      ],
      look: i >= 16 && i < 22 ? -1 : i >= 30 && i < 36 ? 1 : 0,
      face: i === 12 || i === 40 ? 'blink' : i >= 24 && i < 28 ? 'happy' : 'neutral',
    }
  }
  const squat: Pose = {
    view: 'front',
    y: 5,
    legs: crouch(5),
    arms: [
      { shoulder: 0.3, elbow: 0.2 },
      { shoulder: 0.3, elbow: 0.2 },
    ],
  }
  return [
    ...tween(FRONT, squat, 240),
    ...hold(sitting(0), 120),
    ...Array.from({ length: 46 }, (_, i) => ({ pose: sitting(i), ms: 110 })),
    ...hold(squat, 160),
    ...tween(squat, FRONT, 240),
    ...hold(FRONT, 180),
  ]
}

/** A curtsy, from the front: her robe held out at the sides, a dip with her head tilted, smiling. */
function curtsy(): Key[] {
  const holding = (depth: number, spread: number, face: Pose['face'], tilt = 0): Pose => ({
    view: 'front',
    y: depth,
    legs: crouch(depth),
    spread,
    face,
    tilt,
    // Hands out low at her sides, holding the robe's edges.
    arms: [
      { shoulder: 0.5, elbow: -0.3 },
      { shoulder: 0.5, elbow: -0.3 },
    ],
  })
  const dip = holding(4, 6, 'happy', 0.1)
  return [
    ...hold(FRONT, 160),
    ...tween(FRONT, holding(0, 4, 'neutral'), 280),
    ...tween(holding(0, 4, 'neutral'), dip, 420),
    ...tween(dip, dip, 500),
    ...tween(dip, holding(0, 4, 'happy'), 420),
    ...tween(holding(0, 4, 'happy'), FRONT, 300),
    ...hold(FRONT, 120),
  ]
}

/**
 * Gazing into a crystal ball, from the front: she brings it up in both hands, looks down into it
 * as a wisp of light turns inside and sparkles circle it, then smiles at what she sees and puts it
 * away.
 */
function orb(): Key[] {
  const holding = (face: Pose['face'], spin = 0, sparkle = 0): Pose => ({
    view: 'front',
    prop: 'orb',
    face,
    spin,
    sparkle,
    // Both forearms turned in and up, so her hands meet in front of her waist.
    arms: [
      { shoulder: 0.25, elbow: -1.55 },
      { shoulder: 0.25, elbow: -1.55 },
    ],
  })
  const gazing: Key[] = Array.from({ length: 40 }, (_, i) => ({
    pose: holding('down', i / 20, i >= 8 ? (i - 8) / 32 : 0),
    ms: 50,
  }))
  return [
    ...hold(FRONT, 200),
    ...tween(FRONT, holding('neutral'), 400),
    ...tween(holding('neutral'), holding('down'), 200),
    ...gazing,
    ...tween(holding('down', 2), holding('happy', 2.4), 300),
    ...tween(holding('happy', 2.4), holding('happy', 3), 600),
    ...hold(holding('blink', 3), 120),
    ...tween(holding('happy', 3), FRONT, 400),
    ...hold(FRONT, 180),
  ]
}

/**
 * A twirl: she spins round three times on the spot, arms out, her robe flaring wider as she goes
 * and her hair swinging, then lands, smiling, as the robe settles. A turn is the views in order,
 * front, diagonal, side, then the side and diagonal mirrored (facing the other way): her back,
 * which she has no picture of, goes by in between too fast to miss.
 */
function twirl(): Frame[] {
  const out: [Arm, Arm] = [
    { shoulder: 0.9, elbow: 0.2 },
    { shoulder: 0.9, elbow: 0.2 },
  ]
  const front = (spread: number, wind = 0, face: Pose['face'] = 'happy') =>
    draw({ view: 'front', spread, wind, face, arms: out })
  const diagonal = draw({ view: 'diagonal', face: 'happy', arms: [out[0], ARM_DOWN] })
  const side = (spread: number) =>
    draw({ view: 'side', spread, wind: -2, face: 'happy', arms: out })
  const turn = (spread: number, ms: number): Frame[] => [
    { rows: diagonal, ms },
    { rows: side(spread), ms },
    { rows: mirror(side(spread)), ms },
    { rows: mirror(diagonal), ms },
    { rows: front(spread), ms },
  ]
  return [
    { rows: draw(FRONT), ms: 200 },
    { rows: front(2), ms: 120 },
    ...turn(4, 70),
    ...turn(6, 60),
    ...turn(5, 70),
    { rows: front(6, 1), ms: 160 },
    { rows: front(4, -1), ms: 120 },
    { rows: front(2, 0.5), ms: 120 },
    { rows: front(0), ms: 200 },
    { rows: draw({ view: 'front', face: 'blink' }), ms: 120 },
    { rows: draw(FRONT), ms: 160 },
  ]
}

/**
 * A butterfly, from the front: she holds up a finger beside her; a little magic butterfly flutters
 * down to it and rests there, opening and shutting its wings, while she watches it, smiling; then
 * it flies off up and away, and she lowers her hand.
 */
function butterfly(): Key[] {
  const steps = Math.round(FIDGET_MS.butterfly / FRAME_MS)
  return Array.from({ length: steps }, (_, i) => {
    const t = i / steps
    // Her near hand up beside her head (raised over the first 8%, lowered over the last 10%).
    const up = Math.min(1, t / 0.08, (1 - t) / 0.1)
    const lift = up * up * (3 - 2 * up)
    const arm = { shoulder: 0.08 + 1.47 * lift, elbow: 0.95 * lift }
    return {
      pose: {
        view: 'front',
        butterfly: t,
        arms: [arm, ARM_DOWN],
        look: t > 0.04 && t < 0.92 ? 1 : 0,
        face: t > 0.32 && t < 0.72 ? 'happy' : 'neutral',
      },
      ms: FRAME_MS,
    }
  })
}

/**
 * Dozing, from the front: her eyes close, her head droops and she sways a little while z's float
 * up from her; her head nods, and she wakes with a start, hair flying, looks one way and the other,
 * and blinks.
 */
function doze(flipText = false): Key[] {
  const steps = Math.round(FIDGET_MS.doze / FRAME_MS)
  return Array.from({ length: steps }, (_, i) => {
    const t = i / steps
    if (t < 0.6) {
      // Nodding off: eyes heavy, then shut; head drooping further, a deeper nod near the end.
      const droop = Math.min(1, t / 0.15)
      const nod = t > 0.48 && t < 0.56 ? 0.06 : 0
      return {
        pose: {
          view: 'front',
          face: t < 0.06 ? 'down' : 'blink',
          tilt: 0.12 * droop + nod,
          x: Math.round(Math.sin(t * 14) * 0.6),
          zzz: t > 0.1 ? (t - 0.1) / 0.5 : 0,
          flipText,
        },
        ms: FRAME_MS,
      }
    }
    if (t < 0.68) {
      // Awake with a start.
      return {
        pose: {
          view: 'front',
          face: 'surprised',
          y: -2,
          lift: 1.5,
          arms: [
            { shoulder: 0.45, elbow: 0.2 },
            { shoulder: 0.45, elbow: 0.2 },
          ],
        },
        ms: FRAME_MS,
      }
    }
    // Looking about, then a blink.
    return {
      pose: {
        view: 'front',
        look: t < 0.76 ? -1 : t < 0.84 ? 1 : 0,
        face: t > 0.9 && t < 0.93 ? 'blink' : 'neutral',
      },
      ms: FRAME_MS,
    }
  })
}

/**
 * A glance one way, then the other (the second a mirror image), her eyes leading her head, then a
 * blink.
 */
function look(): Frame[] {
  const front = draw(FRONT)
  const eyesRight = draw({ view: 'front', look: 1 })
  const eyesLeft = draw({ view: 'front', look: -1 })
  const glance = draw({ view: 'diagonal', tilt: 0.04 })
  return [
    { rows: front, ms: 260 },
    { rows: eyesRight, ms: 80 },
    { rows: glance, ms: 520 },
    { rows: eyesRight, ms: 80 },
    { rows: front, ms: 120 },
    { rows: eyesLeft, ms: 80 },
    { rows: mirror(glance), ms: 520 },
    { rows: eyesLeft, ms: 80 },
    { rows: front, ms: 120 },
    { rows: draw({ view: 'front', face: 'blink' }), ms: 120 },
    { rows: front, ms: 420 },
  ]
}

/** Between 0 and 1: how far `t` is from `from` to `to`, eased in and out. */
const between = (t: number, from: number, to: number) =>
  smooth(Math.min(1, Math.max(0, (t - from) / (to - from))))

/**
 * Juggling, from the front: her hands come up in front of her and three little orbs fly between
 * them, up in a high arc from her far hand to her near one and quickly back underneath, each hand
 * dipping as it throws; then they're gone into her hands and she smiles.
 */
function juggle(): Key[] {
  const steps = Math.round(FIDGET_MS.juggle / FRAME_MS)
  const [start, end] = [0.1, 0.88]
  return Array.from({ length: steps }, (_, i) => {
    const t = i / steps
    const ready = between(t, 0, 0.08) * (1 - between(t, 0.92, 1))
    const playing = t >= start && t < end
    const progress = playing ? (t - start) / (end - start) : 0
    // A hand dips as an orb leaves it: three throws a round from each, the near hand's a little
    // after the far one's (when an orb comes to the end of its high arc).
    const dip = (at: number) =>
      playing
        ? Math.max(0, Math.cos((progress * JUGGLE.rounds - at) * 3 * Math.PI * 2)) ** 4 * 0.2
        : 0
    const arm = (d: number): Arm => ({ shoulder: 0.1 + 0.4 * ready - d, elbow: -1.45 * ready + d })
    return {
      pose: {
        view: 'front',
        juggle: progress,
        arms: [arm(dip(JUGGLE.arc)), arm(dip(0))],
        face: t >= end + 0.02 ? 'happy' : 'neutral',
      },
      ms: FRAME_MS,
    }
  })
}

/**
 * Bubbles, seen diagonally: she holds a little wand ring up in front of her mouth and blows
 * through it, puffing before each bubble; they drift up and away, wobbling, and pop. She puts the
 * wand away and watches the last ones go, smiling.
 */
function bubbles(): Key[] {
  const steps = Math.round(FIDGET_MS.bubbles / FRAME_MS)
  const blowing: Arm = { shoulder: 0.75, elbow: 2.45 }
  return Array.from({ length: steps }, (_, i) => {
    const t = i / steps
    const up = between(t, 0, 0.08) * (1 - between(t, BUBBLES.wandAway, BUBBLES.wandAway + 0.06))
    const arm: Arm = {
      shoulder: lerp(ARM_DOWN.shoulder, blowing.shoulder, up),
      elbow: lerp(ARM_DOWN.elbow, blowing.elbow, up),
    }
    // A puff just before each bubble comes.
    const puffing = Array.from(
      { length: BUBBLES.count },
      (_, k) => BUBBLES.first + k * BUBBLES.gap,
    ).some((at) => t > at - 0.045 && t <= at + 0.005)
    const face: Pose['face'] = puffing
      ? 'sip'
      : t > 0.9 && t < 0.93
        ? 'blink'
        : t > BUBBLES.wandAway - 0.1
          ? 'happy'
          : 'neutral'
    return { pose: { view: 'diagonal', bubbles: t, arms: [arm, ARM_DOWN], face }, ms: FRAME_MS }
  })
}

/**
 * A will-o'-wisp, from the front: a little light appears beside her (she's surprised), goes round
 * her twice, behind her and in front (see wispAt), her eyes following it and a smile as it passes
 * in front; then it flies off up and away, and she waves it goodbye.
 */
function wisp(): Key[] {
  const steps = Math.round(FIDGET_MS.wisp / FRAME_MS)
  return Array.from({ length: steps }, (_, i) => {
    const t = i / steps
    const at = wispAt(t)
    const bye = between(t, 0.8, 0.84) * (1 - between(t, 0.94, 0.98))
    const arm: Arm = {
      shoulder: 0.08 + 1.45 * bye,
      elbow: (0.75 + 0.35 * Math.sin(t * 70)) * bye,
    }
    const inFront = at !== null && !at.behind && Math.abs(at.x) < 12
    return {
      pose: {
        view: 'front',
        wisp: t,
        look: at === null ? 0 : at.x > 7 ? 1 : at.x < -7 ? -1 : 0,
        arms: [arm, ARM_DOWN],
        face: t > 0.06 && t < 0.14 ? 'surprised' : inFront || bye > 0 ? 'happy' : 'neutral',
      },
      ms: FRAME_MS,
    }
  })
}

/**
 * A sneeze, from the front: her nose twitches, "ah..." (her head goes back), a breath, "ah..."
 * (further back, eyes shut), "choo!" (forward, hair flying, hands up), and the sneeze bursts into
 * sparkles that fly out and fade; she looks surprised, then smiles sheepishly and blinks.
 */
function sneeze(): Key[] {
  const twitch: Pose = { view: 'front', face: 'surprised' }
  const ah = (tilt: number, face: Pose['face']): Pose => ({ view: 'front', face, tilt, lift: -0.5 })
  const hands: [Arm, Arm] = [
    { shoulder: 0.3, elbow: -0.9 },
    { shoulder: 0.3, elbow: -0.9 },
  ]
  const choo: Pose = { view: 'front', face: 'blink', tilt: 0.1, lift: 1.5, arms: hands, burst: 0.1 }
  const after: Pose = { view: 'front', face: 'surprised', tilt: 0.03, burst: 0.55 }
  const sheepish: Pose = { view: 'front', face: 'happy', burst: 1 }
  return [
    ...hold(FRONT, 200),
    ...hold(twitch, 160),
    ...tween(twitch, ah(-0.06, 'down'), 360),
    ...tween(ah(-0.06, 'down'), ah(-0.03, 'down'), 160),
    ...tween(ah(-0.03, 'down'), ah(-0.1, 'blink'), 420),
    ...tween(ah(-0.1, 'blink'), choo, 80),
    ...tween(choo, after, 520),
    ...tween(after, sheepish, 480),
    ...hold({ view: 'front', face: 'happy' }, 360),
    ...hold({ view: 'front', face: 'blink' }, 120),
    ...hold(FRONT, 140),
  ]
}

/**
 * A little jig, from the front: she steps to one side with that arm up and her other hand on her
 * hip, then hops, kicking her other foot out, her robe swinging and her hair flying the other way;
 * then the other side, seven beats in all, and back to standing.
 */
function dance(): Key[] {
  const up: Arm = { shoulder: 2.4, elbow: 0.6 }
  const hip: Arm = { shoulder: 0.55, elbow: -1.6 }
  const kick: Leg = { hip: 0.35, knee: 0.5 }
  const step = (side: 1 | -1, hopping: boolean): Pose => ({
    view: 'front',
    face: 'happy',
    x: 2 * side,
    y: hopping ? -2 : 0,
    wind: -1.2 * side,
    spread: 2,
    arms: side === 1 ? [up, hip] : [hip, up],
    legs: hopping ? (side === 1 ? [LEG_STAND, kick] : [kick, LEG_STAND]) : [LEG_STAND, LEG_STAND],
  })
  const beats: Key[] = []
  let last: Pose = FRONT
  for (let beat = 0; beat < 7; beat++) {
    const side = beat % 2 === 0 ? 1 : -1
    beats.push(
      ...tween(last, step(side, false), 190),
      ...tween(step(side, false), step(side, true), 190),
    )
    last = step(side, true)
  }
  return [...hold(FRONT, 160), ...beats, ...tween(last, FRONT, 260), ...hold(FRONT, 120)]
}

/**
 * Carried by her collar: off the ground, arms up, legs kicking, swaying, hair lifted, and no
 * shadow under her (she's in the air, wherever the pointer takes her).
 */
function dragged(): Key[] {
  return Array.from({ length: 12 }, (_, i) => {
    const phase = (i / 12) * Math.PI * 2
    const kick = Math.sin(phase * 2)
    return {
      pose: {
        view: 'front',
        face: 'surprised',
        shadow: false,
        x: Math.round(Math.sin(phase)),
        y: -4,
        tilt: Math.sin(phase) * 0.05,
        lift: 3,
        wind: Math.sin(phase) * 1.5,
        arms: [
          { shoulder: 2.4 + 0.25 * kick, elbow: 0.3 },
          { shoulder: 2.55 - 0.25 * kick, elbow: 0.3 },
        ],
        legs: [
          { hip: 0.12 + 0.12 * kick, knee: 0.25 + 0.35 * Math.max(0, kick) },
          { hip: 0.12 - 0.12 * kick, knee: 0.25 + 0.35 * Math.max(0, -kick) },
        ],
      },
      ms: 55,
    }
  })
}

// ------------------------------------------------------------------------------------- frames

const drawn = (keys: Key[]): Frame[] => keys.map(({ pose, ms }) => ({ rows: draw(pose), ms }))

/** How each pose's frames are made, facing right. */
const MAKERS: Record<Name, () => Frame[]> = {
  idle: () => drawn(idle()),
  'walk-right': () => drawn(walk()),
  'walk-left': () => drawn(walk()),
  hop: () => drawn(hop()),
  wave: () => drawn(wave()),
  stretch: () => drawn(stretch()),
  sip: () => drawn(sip()),
  read: () => drawn(read()),
  spell: () => drawn(spell()),
  levitate: () => drawn(levitate()),
  vision: () => drawn(vision()),
  curtsy: () => drawn(curtsy()),
  orb: () => drawn(orb()),
  twirl,
  butterfly: () => drawn(butterfly()),
  doze: () => drawn(doze()),
  sit: () => drawn(sit()),
  look,
  juggle: () => drawn(juggle()),
  bubbles: () => drawn(bubbles()),
  wisp: () => drawn(wisp()),
  sneeze: () => drawn(sneeze()),
  dance: () => drawn(dance()),
  dragged: () => drawn(dragged()),
}

/**
 * Poses with letters in them (the dozer's z's), drawn the other way round for facing left, so
 * they read right once the frame is mirrored.
 */
const LEFT_MAKERS: Partial<Record<Name, () => Frame[]>> = {
  doze: () => drawn(doze(true)),
}

/** Whether a pose's animation repeats (the fidgets play once, for FIDGET_MS). */
export const LOOPS: Record<Name, boolean> = {
  idle: true,
  'walk-left': true,
  'walk-right': true,
  dragged: true,
  hop: false,
  wave: false,
  stretch: false,
  sip: false,
  read: false,
  spell: false,
  levitate: false,
  vision: false,
  curtsy: false,
  orb: false,
  twirl: false,
  butterfly: false,
  doze: false,
  sit: false,
  look: false,
  juggle: false,
  bubbles: false,
  wisp: false,
  sneeze: false,
  dance: false,
}

export type Facing = 'left' | 'right'

const made = new Map<string, Frame[]>()

/**
 * A pose's frames, facing `facing` (walking faces the way she walks, whatever `facing` says).
 * Drawn the first time they're asked for, then kept.
 */
export function framesOf(pose: Name, facing: Facing): Frame[] {
  const way = pose === 'walk-left' ? 'left' : pose === 'walk-right' ? 'right' : facing
  const key = `${pose}:${way}`
  let frames = made.get(key)
  if (!frames) {
    const right = made.get(`${pose}:right`) ?? MAKERS[pose]()
    made.set(`${pose}:right`, right)
    frames =
      way === 'right'
        ? right
        : (LEFT_MAKERS[pose]?.() ?? right).map((f) => ({ rows: mirror(f.rows), ms: f.ms }))
    made.set(key, frames)
  }
  return frames
}

/** How long a pose's frames last altogether (a fidget's must match FIDGET_MS). */
export const animationLength = (pose: Name): number =>
  framesOf(pose, 'right').reduce((total, f) => total + f.ms, 0)

/** The frame mirrored left to right. */
export function mirror(rows: string[]): string[] {
  return rows.map((row) => [...row].reverse().join(''))
}

/**
 * A frame as one SVG path per colour: each run of same-coloured pixels along a row is one
 * rectangle, so a frame is a few dozen elements rather than thousands.
 */
export function framePaths(rows: string[]): { className: string; d: string }[] {
  const byColour = new Map<string, string[]>()
  rows.forEach((row, y) => {
    let x = 0
    while (x < row.length) {
      const pixel = row[x]!
      let end = x + 1
      while (end < row.length && row[end] === pixel) end++
      if (pixel !== '.') {
        const runs = byColour.get(pixel) ?? []
        runs.push(`M${x} ${y}h${end - x}v1h-${end - x}z`)
        byColour.set(pixel, runs)
      }
      x = end
    }
  })
  return [...byColour].map(([pixel, runs]) => ({
    className: PALETTE[pixel] ?? 'px-hair-line',
    d: runs.join(''),
  }))
}
