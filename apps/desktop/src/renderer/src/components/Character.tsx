import type { CSSProperties } from 'react'
import { FIDGET_MS, isFidget, type Pose } from '@shared/character'
import { BUBBLE_BOX } from '@shared/geometry'
import './character.css'

/**
 * The character that stands in for the bubble: a blank placeholder figure (head, body, arms and
 * legs), drawn to fill the bubble's window with its feet on the window's bottom edge, which the
 * main process keeps on the taskbar. Each pose is a CSS animation in character.css; the main
 * process decides the pose (and moves the window while it walks). When there's real artwork, it
 * replaces the shapes here and the animations, keyed by the same poses.
 *
 * The drawing's units are DIPs of a 72 × 72 window (BUBBLE_BOX); a different BUBBLE_BOX scales it.
 */
export function Character(props: { pose: Pose; expanded: boolean }) {
  const { pose } = props
  // Fidgets play once, for as long as the main process waits before going back to idle.
  const style = isFidget(pose)
    ? ({ '--ch-fidget': `${FIDGET_MS[pose]}ms` } as CSSProperties)
    : undefined
  return (
    <svg
      viewBox="0 0 72 72"
      width={BUBBLE_BOX}
      height={BUBBLE_BOX}
      className="character"
      data-pose={pose}
      data-expanded={props.expanded || undefined}
      style={style}
      aria-hidden
    >
      <ellipse className="ch-shadow" cx="36" cy="70" rx="12" ry="2" />
      <g className="ch-hover">
        <g className="ch-lean">
          <g className="ch-move ch-figure">
            <g className="ch-arm-a-pos">
              <g className="ch-arm-a">
                <rect className="ch-part" x="22.5" y="29" width="5" height="18" rx="2.5" />
              </g>
            </g>
            <g className="ch-leg-a-pos">
              <g className="ch-leg-a">
                <rect className="ch-part" x="30" y="47" width="6" height="22" rx="3" />
              </g>
            </g>
            <g className="ch-leg-b-pos">
              <g className="ch-leg-b">
                <rect className="ch-part" x="36" y="47" width="6" height="22" rx="3" />
              </g>
            </g>
            <rect className="ch-part" x="27" y="27" width="18" height="25" rx="8" />
            <circle className="ch-part" cx="36" cy="19" r="9" />
            <g className="ch-arm-b-pos">
              <g className="ch-arm-b">
                <rect className="ch-part" x="44.5" y="29" width="5" height="18" rx="2.5" />
              </g>
            </g>
          </g>
        </g>
      </g>
    </svg>
  )
}
