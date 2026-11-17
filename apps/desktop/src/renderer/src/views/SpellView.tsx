import { useEffect, useRef, useState } from 'react'
import { DEFAULT_SIZE, snapSize } from '@shared/geometry'
import { SPELL_EFFECT_MS, type SpellEffect } from '@shared/spells'
import { SPELL_ART } from '../lib/spellArt'

/**
 * How many DIPs one pixel of the effects is, per her size: twice one of her sprite's pixels. Never
 * less than 2 DIPs, though, so at her smallest the explosion isn't drawn a DIP at a time over a
 * whole screen (four times the pixels, every frame).
 */
const PIXEL = 2

/**
 * A spell's effects (see SpellEffects in the main process): its window covers her display's work
 * area, never takes the mouse, and closes itself when the spell is over. The query string says
 * which spell, her size, where she stands and how far down her feet are (DIPs), when it was cast
 * (wall-clock ms, so it keeps in time with her) and her accent colour. It draws on a small canvas,
 * a pixel at a time (lib/spellArt.ts), stretched over the window without smoothing, so the effects
 * are pixel art like her, their pixels twice the size of hers.
 */
export function SpellView() {
  const [params] = useState(() => new URLSearchParams(window.location.search))
  const asked = params.get('spell') ?? ''
  const spell: SpellEffect = Object.hasOwn(SPELL_EFFECT_MS, asked)
    ? (asked as SpellEffect)
    : 'starfall'
  const scale = snapSize(Number(params.get('scale')) || DEFAULT_SIZE)
  const accent = /^#[0-9a-f]{6}$/i.test(params.get('accent') ?? '')
    ? params.get('accent')!
    : '#9333ea'
  const canvas = useRef<HTMLCanvasElement>(null)
  // With Windows' reduced-motion setting, nothing moves: the effects just show, still.
  const [still] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)

  useEffect(() => {
    const element = canvas.current
    if (!element) return
    const pixel = Math.max(2, PIXEL * scale)
    const w = Math.ceil(window.innerWidth / pixel)
    const h = Math.ceil(window.innerHeight / pixel)
    element.width = w
    element.height = h
    const g = element.getContext('2d')!
    const x = (Number(params.get('x')) || window.innerWidth / 2) / pixel
    const feet = (Number(params.get('feet')) || window.innerHeight) / pixel
    const starts = Number(params.get('starts')) || Date.now()
    const draw = SPELL_ART[spell]
    let frame = requestAnimationFrame(function tick() {
      const t = Date.now() - starts
      g.clearRect(0, 0, w, h)
      draw(g, { t, w, h, x, feet, height: (92 * scale) / pixel, accent, still })
      if (t < SPELL_EFFECT_MS[spell]) frame = requestAnimationFrame(tick)
    })
    return () => cancelAnimationFrame(frame)
  }, [params, spell, scale, accent, still])

  return (
    <canvas
      ref={canvas}
      aria-hidden
      className="block h-full w-full"
      style={{ imageRendering: 'pixelated' }}
    />
  )
}
