/**
 * Sets up a canvas that fills a passive overlay window (shared/views.ts) for drawing in screen
 * DIPs: sized to the window at the screen's pixel ratio, so it's sharp. Returns its context and
 * the window's top-left on the screen, to take from screen positions (`x - origin.x`).
 */
export function fitToWindow(canvas: HTMLCanvasElement): {
  g: CanvasRenderingContext2D
  origin: { x: number; y: number }
} {
  const origin = { x: window.screenX, y: window.screenY }
  const ratio = window.devicePixelRatio || 1
  canvas.width = Math.round(window.innerWidth * ratio)
  canvas.height = Math.round(window.innerHeight * ratio)
  const g = canvas.getContext('2d')!
  g.scale(ratio, ratio)
  return { g, origin }
}
