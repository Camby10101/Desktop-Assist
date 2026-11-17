// Colours for her robe and hat (Settings → Robe colour): the swatches offered, and turning a hue
// from the slider into a colour and back. Her hat is mixed darker from the same colour in
// character.css, so it always goes with the robe; her trim, gold and patterns stay as they are.

/** The ready-made robe colours, after the company's own (which is always offered first). */
export const ROBE_SWATCHES: readonly { label: string; color: string }[] = [
  { label: 'Midnight', color: '#312e81' },
  { label: 'Blue', color: '#2563eb' },
  { label: 'Teal', color: '#0d9488' },
  { label: 'Forest', color: '#15803d' },
  { label: 'Gold', color: '#ca8a04' },
  { label: 'Crimson', color: '#b91c1c' },
  { label: 'Rose', color: '#db2777' },
  { label: 'Charcoal', color: '#374151' },
]

/** A colour as the setting stores it: `#rrggbb`. */
export const HEX_COLOR = /^#[0-9a-f]{6}$/i

/** The colour of a hue (0 to 360 degrees) at the slider's saturation and lightness, as `#rrggbb`. */
export function hueToHex(hue: number, saturation = 0.7, lightness = 0.48): string {
  const h = (((hue % 360) + 360) % 360) / 60
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation
  const x = chroma * (1 - Math.abs((h % 2) - 1))
  const [r, g, b] =
    h < 1
      ? [chroma, x, 0]
      : h < 2
        ? [x, chroma, 0]
        : h < 3
          ? [0, chroma, x]
          : h < 4
            ? [0, x, chroma]
            : h < 5
              ? [x, 0, chroma]
              : [chroma, 0, x]
  const m = lightness - chroma / 2
  return `#${[r, g, b]
    .map((v) =>
      Math.round((v + m) * 255)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`
}

/** A colour's hue (0 to 360 degrees), for where the slider starts; 0 for greys. */
export function hueOf(color: string): number {
  if (!HEX_COLOR.test(color)) return 0
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16) / 255) as [
    number,
    number,
    number,
  ]
  const max = Math.max(r, g, b)
  const chroma = max - Math.min(r, g, b)
  if (chroma === 0) return 0
  const h =
    max === r ? ((g - b) / chroma) % 6 : max === g ? (b - r) / chroma + 2 : (r - g) / chroma + 4
  return Math.round((h * 60 + 360) % 360)
}
