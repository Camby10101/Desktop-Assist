// The screen saver, from the icon beside her: every screen fades to white, then a scene fades in
// out of the white. On her screen, a pixel sunset over rolling hills, with her standing on the
// nearest, her back to us, watching it; on the others, stars falling through the night sky.
// Moving the mouse, clicking or pressing a key ends it: the scenes fade away and she's back.
// Shared by the main process (which opens and closes its windows) and their page.

export const SCREEN_SAVER = {
  /** Every screen fades to white over this long (ms)... */
  whiteMs: 1_500,
  /** ...then its scene fades in out of the white over this long. */
  sceneMs: 3_500,
  /** Woken, the scenes fade away over this long, back to the desktop, and she forms again. */
  fadeOutMs: 800,
  /** The mouse moving less than this far (DIPs) doesn't wake it: a nudge of the desk. */
  wakeMove: 6,
  /** Its window losing the focus wakes it too, but not this soon after it opens (ms). */
  blurGraceMs: 1_000,
} as const

/** Which scene a screen shows: hers, the sunset, or the others', the starfall. */
export type SaverScene = 'sunset' | 'stars'
