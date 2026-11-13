// The character that stands in for the bubble: what it's doing (its pose), shared by the main
// process (which decides) and the bubble's page (which animates it).

/**
 * - `idle`: standing, bobbing gently.
 * - `fidget-1`, `fidget-2`: a short animation (a hop, a wave) now and then, once it's been left
 *   alone for a while.
 * - `walk-left`, `walk-right`: walking along the taskbar (the window moves with it).
 * - `dragged`: dangling while it's dragged, thrown about by Bounce, or falling after a drop.
 */
export type Pose = 'idle' | 'fidget-1' | 'fidget-2' | 'walk-left' | 'walk-right' | 'dragged'

export type Fidget = 'fidget-1' | 'fidget-2'

/** How long each fidget plays (ms): the main process goes back to idle after it. */
export const FIDGET_MS: Record<Fidget, number> = {
  'fidget-1': 1200,
  'fidget-2': 2000,
}

export const isFidget = (pose: Pose): pose is Fidget => pose === 'fidget-1' || pose === 'fidget-2'
