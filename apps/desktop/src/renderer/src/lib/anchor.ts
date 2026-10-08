import type { CSSProperties } from 'react'
import { isLeftCorner, isTopCorner, type Corner } from '@shared/geometry'

/**
 * Positions an element inside the panel window measured from the bubble's corner: `x` across
 * and `y` away from the screen edge. In the bottom-right corner that's `right`/`bottom`; in the
 * top-left it's `left`/`top`, and so on, so the panel mirrors itself to open into the screen.
 */
export function anchored(corner: Corner, x: number, y: number): CSSProperties {
  return {
    [isLeftCorner(corner) ? 'left' : 'right']: x,
    [isTopCorner(corner) ? 'top' : 'bottom']: y,
  }
}

/** Tailwind transform-origin class for animations that should grow out of the bubble's corner. */
export function originClass(corner: Corner): string {
  return {
    'top-left': 'origin-top-left',
    'top-right': 'origin-top-right',
    'bottom-left': 'origin-bottom-left',
    'bottom-right': 'origin-bottom-right',
  }[corner]
}
