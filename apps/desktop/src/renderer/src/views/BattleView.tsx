import { useEffect, useRef, useState } from 'react'
import { battleFrame, MONSTER_SIZE, type BattlePlan, type MonsterKind } from '@shared/battle'

// The monsters of her battle (shared/battle.ts), my own designs, as pixel art: rows of letters,
// each a colour (MONSTER_COLOURS), `.` see-through, two frames each (walking, or wings beating),
// facing left (mirrored to face right).

const MONSTER_FRAMES: Record<MonsterKind, readonly (readonly string[])[]> = {
  // A green slime, a glint on its dome, wobbling as it comes.
  slime: [
    [
      '........kkkkkk........',
      '......kkGGGGGGkk......',
      '.....kGGGGGGGGGGk.....',
      '....kGwwGGGGGGGGGk....',
      '...kGwwGGGGGGGGGGGk...',
      '...kGGGGGGGGGGGGGGk...',
      '..kGGkkGGGGkkGGGGGGk..',
      '..kGGkwGGGGkwGGGGGGk..',
      '.kGGGkkGGGGkkGGGGGGGk.',
      '.kGGGGGGGGGGGGGGGGGGk.',
      '.kGGGGGGkkkkGGGGGGGGk.',
      'kgGGGGGGGGGGGGGGGGGGgk',
      'kggggggggggggggggggggk',
      '.kkkkkkkkkkkkkkkkkkkk.',
    ],
    [
      '......................',
      '.......kkkkkkkk.......',
      '.....kkGGGGGGGGkk.....',
      '...kkGwwGGGGGGGGGkk...',
      '..kGwwGGGGGGGGGGGGGk..',
      '..kGGkkGGGGkkGGGGGGk..',
      '.kGGGkwGGGGkwGGGGGGGk.',
      '.kGGGkkGGGGkkGGGGGGGk.',
      'kGGGGGGGGGGGGGGGGGGGGk',
      'kGGGGGGGkkkkGGGGGGGGGk',
      'kGGGGGGGGGGGGGGGGGGGGk',
      'kgggggggggggggggggggk.',
      'kggggggggggggggggggggk',
      '.kkkkkkkkkkkkkkkkkkkk.',
    ],
  ],
  // A toadstool creature: a red cap with white spots, beady eyes, stubby legs.
  toadstool: [
    [
      '......rrrrrr......',
      '....rrRRRRRRrr....',
      '...rRRwwRRRRRRr...',
      '..rRRwwwRRRwwRRr..',
      '.rRRRRwRRRRwwwRRr.',
      'rRRwwRRRRRRRwRRRRr',
      'rRwwwRRRRRwwRRRRRr',
      'rrRRRRRRRRwwRRRRrr',
      '.rrrrrrrrrrrrrrrr.',
      '....bccccccccb....',
      '....bckcccckcb....',
      '....bckcccckcb....',
      '....bccccccccb....',
      '....bcccbbcccb....',
      '....bccccccccb....',
      '.....bccccccb.....',
      '.....bccccccb.....',
      '.....bb....bb.....',
      '....bbb....bbb....',
      '..................',
    ],
    [
      '......rrrrrr......',
      '....rrRRRRRRrr....',
      '...rRRwwRRRRRRr...',
      '..rRRwwwRRRwwRRr..',
      '.rRRRRwRRRRwwwRRr.',
      'rRRwwRRRRRRRwRRRRr',
      'rRwwwRRRRRwwRRRRRr',
      'rrRRRRRRRRwwRRRRrr',
      '.rrrrrrrrrrrrrrrr.',
      '....bccccccccb....',
      '....bckcccckcb....',
      '....bckcccckcb....',
      '....bccccccccb....',
      '....bcccbbcccb....',
      '....bccccccccb....',
      '.....bccccccb.....',
      '.....bccccccb.....',
      '......bb..bb......',
      '.....bbb..bbb.....',
      '..................',
    ],
  ],
  // A little horned imp on bat wings, yellow eyes, a forked tail.
  imp: [
    [
      'p....................p',
      'pp..................pp',
      'pPp.......h..h.....pPp',
      'pPPp......hmmh....pPPp',
      '.pPPp....mMMMMm..pPPp.',
      '.pPPPp..mMyMMyMmpPPPp.',
      '..pPPPpmMMMMMMMMpPPp..',
      '...pppmMMMkkkMMMmpp...',
      '......mMMMMMMMMMm.....',
      '.......mMMMMMMMm......',
      '........mMMMMMm.......',
      '.........mm.mm..mm....',
      '................m.m...',
      '..................m...',
      '......................',
    ],
    [
      '......................',
      '..........h..h........',
      '..........hmmh........',
      '.........mMMMMm.......',
      '........mMyMMyMm......',
      '.......mMMMMMMMMm.....',
      '..pppppmMMkkkMMMmppp..',
      '.pPPPPPmMMMMMMMMmPPPp.',
      'pPPPPPPPmMMMMMMmPPPPPp',
      'pPPPpppppmMMMMmpppPPPp',
      'pPpp.....mm.mm..mm.pPp',
      'pp..............m.m.pp',
      'p.................m..p',
      '......................',
      '......................',
    ],
  ],
}

const MONSTER_COLOURS: Record<string, string> = {
  // The slime
  k: '#1f4d2e',
  G: '#4fbf6a',
  g: '#2f8a48',
  w: '#f4fff4',
  // The toadstool
  r: '#5a1414',
  R: '#d23a3a',
  b: '#5a3a1e',
  c: '#f1dfb8',
  // The imp
  p: '#2b1d3d',
  P: '#6d4c8f',
  m: '#2a1a35',
  M: '#8a5aa8',
  h: '#e8d8c0',
  y: '#ffd84a',
}

/**
 * Her battle (shared/battle.ts), in a see-through window along the bottom of her screen that
 * never takes the mouse: from the plan and the time it began (in the query string), each frame it
 * draws the monsters where the battle has them, her bolts flying at them and their bursts. The
 * main process holds her in her poses in step, and closes the window when it's over.
 */
export function BattleView() {
  const [params] = useState(() => new URLSearchParams(window.location.search))
  const canvas = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const element = canvas.current
    if (!element) return
    let plan: BattlePlan
    try {
      plan = JSON.parse(params.get('plan') ?? '') as BattlePlan
    } catch {
      return
    }
    const starts = Number(params.get('starts')) || Date.now()
    const origin = { x: window.screenX, y: window.screenY }
    const ratio = window.devicePixelRatio || 1
    element.width = Math.round(window.innerWidth * ratio)
    element.height = Math.round(window.innerHeight * ratio)
    const g = element.getContext('2d')!
    g.scale(ratio, ratio)
    const px = plan.scale
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const tick = () => {
      const now = Date.now() - starts
      const frame = battleFrame(plan, now)
      g.clearRect(0, 0, window.innerWidth, window.innerHeight)
      for (const monster of frame.monsters) {
        const shape = MONSTER_SIZE[monster.kind]
        const frames = MONSTER_FRAMES[monster.kind]
        const rows = frames[still ? 0 : Math.floor(now / 180) % frames.length]!
        const width = shape.width * px
        const height = shape.height * px
        g.save()
        g.translate(monster.x - origin.x, monster.y - origin.y - height / 2)
        if (monster.state === 'knocked') g.rotate(monster.spin)
        // Drawn facing left; mirrored to face right.
        if (monster.facing === 'right') g.scale(-1, 1)
        rows.forEach((row, r) => {
          for (let c = 0; c < row.length; c++) {
            const colour = MONSTER_COLOURS[row[c]!]
            if (!colour) continue
            g.fillStyle = colour
            g.fillRect(c * px - width / 2, r * px - height / 2, px + 0.5, px + 0.5)
          }
        })
        g.restore()
      }
      // Her bolts: a glowing ball of magic, a dark edge so it shows on anything, with a fading
      // trail behind it.
      for (const bolt of frame.bolts) {
        const x = bolt.x - origin.x
        const y = bolt.y - origin.y
        for (let k = 5; k >= 1; k--) {
          g.globalAlpha = 0.14 * (6 - k)
          g.fillStyle = k % 2 ? '#5fe3c1' : '#c8fff0'
          const s = (7 - k) * px
          g.fillRect(x - bolt.way * k * 4 * px - s / 2, y - s / 2, s, s)
        }
        g.globalAlpha = 1
        g.fillStyle = '#0f5c4d'
        g.fillRect(x - 5 * px, y - 3 * px, 10 * px, 6 * px)
        g.fillRect(x - 3 * px, y - 5 * px, 6 * px, 10 * px)
        g.fillStyle = '#5fe3c1'
        g.fillRect(x - 4 * px, y - 2 * px, 8 * px, 4 * px)
        g.fillRect(x - 2 * px, y - 4 * px, 4 * px, 8 * px)
        g.fillStyle = '#ffffff'
        g.fillRect(x - 2 * px, y - 2 * px, 4 * px, 4 * px)
      }
      // Bursts where they hit: a flash, then a star of sparkles flying out and fading.
      for (const burst of frame.bursts) {
        const x = burst.x - origin.x
        const y = burst.y - origin.y
        if (burst.age < 0.25) {
          const s = (8 + burst.age * 24) * px
          g.globalAlpha = 1 - burst.age * 3
          g.fillStyle = '#ffffff'
          g.fillRect(x - s / 2, y - px, s, 2 * px)
          g.fillRect(x - px, y - s / 2, 2 * px, s)
          g.fillRect(x - s / 4, y - s / 4, s / 2, s / 2)
        }
        g.globalAlpha = 1 - burst.age * burst.age
        for (let k = 0; k < 10; k++) {
          const angle = (k / 10) * Math.PI * 2 + 0.3
          const reach = (5 + burst.age * 20) * px
          const s = (k % 2 ? 3 : 2) * px
          g.fillStyle = k % 2 ? '#fde68a' : '#5fe3c1'
          g.fillRect(x + Math.cos(angle) * reach - s / 2, y + Math.sin(angle) * reach - s / 2, s, s)
        }
        g.globalAlpha = 1
      }
    }
    tick()
    const timer = setInterval(tick, 40)
    return () => clearInterval(timer)
  }, [params])

  return <canvas ref={canvas} className="block h-screen w-screen" aria-hidden />
}
