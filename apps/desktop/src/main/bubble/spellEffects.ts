import type { Rect } from '@shared/geometry'
import { EXPLOSION, SPELL_EFFECT_MS, type SpellEffect } from '@shared/spells'

/** The window a spell's effects are drawn in, as SpellEffects uses it. index.ts makes it. */
export interface SpellWindow {
  close(): void
}

export interface SpellEffectsDeps {
  /** The tenant's accent colour, for the magic circles. */
  accentColor: string
  /**
   * Opens the effects' window over `bounds`, its page told (in its query string) which spell, her
   * size, where she stands across it and how far down her feet are (DIPs from its left and top
   * edges), when the spell was cast, and the accent colour.
   */
  open(bounds: Rect, query: Record<string, string>): SpellWindow
  /** Wall-clock time (ms), shared with the page, which keeps in time with her from it. */
  now?: () => number
}

/** Stopping her chant less than this long before its end still lets the explosion go off. */
export const CHANT_SLACK_MS = 250

/**
 * The window her spells' effects are drawn in (starfall, and the explosion's pillar of magic
 * circles and its bang): over the whole of her display's work area, since the stars fall across
 * all of it and the explosion goes off in the middle of it, and never taking the mouse or the
 * focus. One at a time; each closes itself once its spell is over (SPELL_EFFECT_MS).
 */
export class SpellEffects {
  private current: {
    spell: SpellEffect
    startedAt: number
    window: SpellWindow
    timer: ReturnType<typeof setTimeout>
  } | null = null

  constructor(private readonly deps: SpellEffectsDeps) {}

  /** The spell whose effects are showing, or null. */
  get running(): SpellEffect | null {
    return this.current?.spell ?? null
  }

  /**
   * Whether the explosion is still at its chant, before the bang: if she stops chanting now
   * (someone clicked or picked her up), it's called off.
   */
  get chanting(): boolean {
    if (this.current?.spell !== 'explosion') return false
    return this.now() - this.current.startedAt < EXPLOSION.chantMs - CHANT_SLACK_MS
  }

  /** Draws `spell`'s effects over her display, from where she stands (BubbleController.standing). */
  start(spell: SpellEffect, standing: { workArea: Rect; bounds: Rect; scale: number }): void {
    this.stop()
    const { workArea, bounds, scale } = standing
    const startedAt = this.now()
    const window = this.deps.open(workArea, {
      spell,
      scale: String(scale),
      x: String(Math.round(bounds.x + bounds.width / 2 - workArea.x)),
      feet: String(Math.round(bounds.y + bounds.height - workArea.y)),
      starts: String(startedAt),
      accent: this.deps.accentColor,
    })
    const timer = setTimeout(() => this.stop(), SPELL_EFFECT_MS[spell])
    this.current = { spell, startedAt, window, timer }
  }

  /** Closes the window now, if one is open. */
  stop(): void {
    if (!this.current) return
    clearTimeout(this.current.timer)
    this.current.window.close()
    this.current = null
  }

  private now(): number {
    return (this.deps.now ?? Date.now)()
  }
}
