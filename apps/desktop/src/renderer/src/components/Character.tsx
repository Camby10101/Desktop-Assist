import { useEffect, useState } from 'react'
import { FIDGETS, type Pose } from '@shared/character'
import { BUBBLE_BOX, isLeftCorner, type Corner } from '@shared/geometry'
import {
  framePaths,
  framesOf,
  LOOPS,
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
const ALL_POSES: Pose[] = ['idle', 'walk-left', 'walk-right', 'dragged', ...FIDGETS]

/**
 * The character that stands in for the bubble: pixel art (character/sprite.ts) filling the
 * bubble's window, one pixel a DIP, her feet on its bottom edge, which the main process keeps on
 * the taskbar. The main process decides the pose (and moves the window while she walks); this
 * plays the pose's frames. She faces the middle of the screen: left from the right-hand corner
 * (walking, she faces the way she walks). `expanded` tints her shadow while the panel is open.
 */
export function Character(props: { pose: Pose; corner: Corner; expanded: boolean }) {
  const facing: Facing = isLeftCorner(props.corner) ? 'right' : 'left'

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
  }, [facing])

  return (
    <svg
      viewBox={`0 0 ${SPRITE_SIZE} ${SPRITE_SIZE}`}
      width={BUBBLE_BOX}
      height={BUBBLE_BOX}
      shapeRendering="crispEdges"
      className="character"
      data-pose={props.pose}
      data-expanded={props.expanded || undefined}
      aria-hidden
    >
      {/* A new pose (or way of facing) starts from its first frame. */}
      <Frames key={`${props.pose}:${facing}`} pose={props.pose} facing={facing} />
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
