// Her colours: each palette letter (a pixel of a frame) and the CSS class that colours it, in
// components/character.css (a test checks every class has a colour there). `.` is see-through.
// Letters free for a new colour: C, H, J, M, Z and t (X is taken: the potion's flask picture marks
// its liquid with it, swapped for the potion's colour as it's drawn).

/** Each letter's colour, as a CSS class (character.css): robe and hat follow the accent colour. */
export const PALETTE: Record<string, string> = {
  // Hair, silver-white: outline, shadow, base, light, shine.
  O: 'px-hair-line',
  D: 'px-hair-shade',
  h: 'px-hair',
  l: 'px-hair-light',
  L: 'px-hair-shine',
  // Skin: outline, shadow, base, light, blush.
  K: 'px-skin-line',
  S: 'px-skin-shade',
  s: 'px-skin',
  z: 'px-skin-light',
  c: 'px-blush',
  // Eyes: lashes and lids, the iris dark to light (amber), a white glint; the mouth.
  e: 'px-lash',
  i: 'px-iris-dark',
  I: 'px-iris',
  j: 'px-iris-light',
  w: 'px-white',
  m: 'px-mouth',
  // The robe: outline, shadow, base, light (all mixed from the accent colour).
  q: 'px-robe-line',
  A: 'px-robe-shade',
  a: 'px-robe',
  v: 'px-robe-light',
  // The robe's silver trim, and the gem of its brooch.
  f: 'px-trim',
  F: 'px-trim-shade',
  G: 'px-gem',
  // Leaves and stems (her flower), and their shade.
  E: 'px-leaf',
  P: 'px-leaf-shade',
  // Gold embroidery and buckles, and its shade.
  Y: 'px-gold',
  k: 'px-gold-shade',
  // Her hat (and her spellbook's cover): a deep shade of the accent colour.
  n: 'px-hat',
  N: 'px-hat-shade',
  g: 'px-hat-light',
  // Stockings and boots, with one dark outline.
  u: 'px-clothes-line',
  o: 'px-stocking',
  Q: 'px-stocking-shade',
  b: 'px-boot',
  B: 'px-boot-shade',
  y: 'px-boot-light',
  x: 'px-shadow',
  // Her portal's swirl, deep to light teal, and its glowing rim.
  d: 'px-portal-deep',
  p: 'px-portal',
  r: 'px-portal-light',
  R: 'px-portal-rim',
  // The little spirit: its glow, its body, its leaf wings, its eyes.
  T: 'px-spirit-glow',
  U: 'px-spirit',
  V: 'px-spirit-wing',
  W: 'px-spirit-eye',
}
