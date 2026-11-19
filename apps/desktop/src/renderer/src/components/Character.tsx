import { useEffect, useState } from 'react'
import { FIDGETS, HELD_POSES, REACTIONS, SPELL_POSES, type Pose } from '@shared/character'
import {
  framePaths,
  framesOf,
  gazeFrame,
  LOOPS,
  setHat,
  SPRITE_HEADROOM,
  SPRITE_SIZE,
  type Facing,
  type Frame,
} from '../character/sprite'
import './character.css'

/** Each frame's SVG paths, worked out the first time it shows. */
const paths = new WeakMap<Frame, ReturnType<typeof framePaths>>()
function pathsOf(frame: Frame): ReturnType<typeof framePaths> {
  let found = paths.get(frame)
  if (!found) {
    found = framePaths(frame.rows)
    paths.set(frame, found)
  }
  return found
}

/** Every pose, for drawing ahead of time. */
const ALL_POSES: Pose[] = [
  'idle',
  'walk-left',
  'walk-right',
  'dragged',
  'flung',
  'splat',
  ...FIDGETS,
  ...SPELL_POSES,
  ...REACTIONS,
  ...HELD_POSES,
]

/**
 * The character: pixel art (character/sprite.ts) drawn `box` DIPs wide and a little taller, for
 * the room above her hat (SPRITE_HEADROOM), her feet on its bottom edge. In the bubble that fills
 * its window, which the main process keeps on the taskbar (one sprite pixel a DIP at her usual
 * size, more when she's bigger); her clones use it too. This plays the pose's frames, facing
 * `facing` (walking, she faces the way she walks). `expanded` tints her shadow while the panel is
 * open.
 */
export function Character(props: {
  pose: Pose
  facing: Facing
  box: number
  expanded?: boolean
  /** Watching the pointer (the `watch` pose): which way her eyes are on it. */
  gaze?: { x: number; y: number } | null
  /** Whether she wears her hat (Settings → No hat takes it off); she does unless told. */
  hat?: boolean
}) {
  const { facing } = props
  const hat = props.hat ?? true
  // Before any frame is asked for: her frames are drawn with her hat on or off.
  setHat(hat)

  // Draws every pose's frames in the background, one pose at a time, so starting one never
  // stutters.
  useEffect(() => {
    const waiting = [...ALL_POSES]
    let timer = setTimeout(function next() {
      const pose = waiting.shift()
      if (!pose) return
      framesOf(pose, facing).forEach(pathsOf)
      timer = setTimeout(next, 50)
    }, 500)
    return () => clearTimeout(timer)
  }, [facing, hat])

  return (
    <svg
      viewBox={`0 0 ${SPRITE_SIZE} ${SPRITE_SIZE + SPRITE_HEADROOM}`}
      width={props.box}
      height={(props.box * (SPRITE_SIZE + SPRITE_HEADROOM)) / SPRITE_SIZE}
      shapeRendering="crispEdges"
      className="character"
      data-pose={props.pose}
      data-expanded={props.expanded || undefined}
      aria-hidden
    >
      {/* A new pose (or way of facing) starts from its first frame. */}
      {props.pose === 'watch' && props.gaze ? (
        // Watching the pointer: a frame for where it is (not mirrored: it's which way on the screen).
        pathsOf(gazeFrame(props.gaze)).map(({ className, d }) => (
          <path key={className} className={className} d={d} />
        ))
      ) : (
        <Frames key={`${props.pose}:${facing}:${hat}`} pose={props.pose} facing={facing} />
      )}
    </svg>
  )
}

/**
 * Plays a pose's frames, each for its time: round and round, or once for a fidget (stopping on
 * its last frame until the main process changes the pose). With Windows' reduced-motion setting,
 * just the first frame.
 */
function Frames({ pose, facing }: { pose: Pose; facing: Facing }) {
  const [index, setIndex] = useState(0)
  const [still] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  const frames = framesOf(pose, facing)

  useEffect(() => {
    if (still || (!LOOPS[pose] && index === frames.length - 1)) return
    const timer = setTimeout(() => setIndex((i) => (i + 1) % frames.length), frames[index]!.ms)
    return () => clearTimeout(timer)
  }, [pose, index, frames, still])

  return pathsOf(frames[index]!).map(({ className, d }) => (
    <path key={className} className={className} d={d} />
  ))
}
