// The figures in "How the code works" (scripts/how-it-works-pdf.mjs puts each where a ```figure
// block names it). Drawn as SVG (or HTML) here rather than as pictures, so they're easy to change.
// Every SVG is 680 units wide, about the width of the page's text.

const THEMES = {
  blue: { fill: '#e8effd', stroke: '#2563eb' },
  green: { fill: '#e3f4ea', stroke: '#15803d' },
  purple: { fill: '#efeafc', stroke: '#6d4fc9' },
  amber: { fill: '#fdf4dd', stroke: '#b45309' },
  grey: { fill: '#f1f3f5', stroke: '#6b7280' },
}
const INK = '#1f2328'
const MUTED = '#57606a'
const ARROW = '#6b7280'
const BLUE = '#2563eb'
const FONT = `font-family="Segoe UI, sans-serif"`

const esc = (text) => String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;')

/** A rounded box with a bold title and a smaller line under it. */
function box(x, y, w, h, title, sub, theme = 'blue', mono = false) {
  const t = THEMES[theme]
  const family = mono ? `font-family="Cascadia Mono, Consolas, monospace"` : FONT
  const titleY = sub ? y + h / 2 - 3 : y + h / 2 + 4
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="7" fill="${t.fill}" stroke="${t.stroke}" stroke-width="1.1"/>
<text x="${x + w / 2}" y="${titleY}" text-anchor="middle" ${family} font-size="11.5" font-weight="700" fill="${INK}">${esc(title)}</text>
${sub ? `<text x="${x + w / 2}" y="${y + h / 2 + 12}" text-anchor="middle" ${FONT} font-size="9.5" fill="${MUTED}">${esc(sub)}</text>` : ''}`
}

/** An arrow from (x1, y1) to (x2, y2), with an optional label beside its middle. */
function arrow(id, x1, y1, x2, y2, { color = ARROW, dashed = false, label, dx = 0, dy = -5 } = {}) {
  const marker = color === BLUE ? `${id}-blue` : `${id}-grey`
  const line = `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="1.3" ${dashed ? 'stroke-dasharray="5 4"' : ''} marker-end="url(#${marker})"/>`
  const text = label
    ? `<text x="${(x1 + x2) / 2 + dx}" y="${(y1 + y2) / 2 + dy}" text-anchor="middle" ${FONT} font-size="9.5" fill="${MUTED}">${esc(label)}</text>`
    : ''
  return line + text
}

function markers(id) {
  const one = (name, color) =>
    `<marker id="${id}-${name}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="${color}"/></marker>`
  return `<defs>${one('grey', ARROW)}${one('blue', BLUE)}</defs>`
}

function figure(svgHeight, id, body, caption) {
  return `<figure><svg viewBox="0 0 680 ${svgHeight}" xmlns="http://www.w3.org/2000/svg">${markers(id)}${body}</svg><figcaption>${caption}</figcaption></figure>`
}

/**
 * A sequence diagram: lanes across the top, messages down the page (`from` and `to` are lane
 * indexes; the same lane twice makes a note on that lane).
 */
function sequence(id, lanes, messages, caption) {
  const width = 680
  const laneX = lanes.map((_, i) => 60 + (i * (width - 120)) / (lanes.length - 1))
  const top = 46
  const step = 38
  const height = top + 20 + messages.length * step + 10
  let body = lanes
    .map((lane, i) => {
      const x = laneX[i]
      return `${box(x - 62, 6, 124, 32, lane, null, 'blue')}
<line x1="${x}" y1="38" x2="${x}" y2="${height - 6}" stroke="#c4c9d0" stroke-dasharray="3 4"/>`
    })
    .join('')
  messages.forEach((m, i) => {
    const y = top + 30 + i * step
    if (m.from === m.to) {
      const x = laneX[m.from]
      const w = Math.min(250, 14 + m.label.length * 5.6)
      const left = Math.min(Math.max(x - w / 2, 4), width - w - 4)
      body += `<rect x="${left}" y="${y - 15}" width="${w}" height="22" rx="4" fill="#fdf4dd" stroke="#b45309" stroke-width="0.9"/>
<text x="${left + w / 2}" y="${y}" text-anchor="middle" ${FONT} font-size="9.5" fill="${INK}">${esc(m.label)}</text>`
      return
    }
    const x1 = laneX[m.from]
    const x2 = laneX[m.to]
    const pad = x2 > x1 ? 3 : -3
    body += arrow(id, x1 + pad, y, x2 - pad, y, {
      color: m.blue ? BLUE : ARROW,
      label: m.label,
      dy: -6,
    })
  })
  return figure(height, id, body, caption)
}

/** Two rows of boxes: along the top left to right, down, then back along the bottom right to left. */
function loop(id, top, bottom, caption, { themes = ['blue', 'green'] } = {}) {
  const n = top.length
  const w = 118
  const gap = (680 - n * w) / (n - 1)
  const xs = top.map((_, i) => i * (w + gap))
  const h = 52
  const y1 = 8
  const y2 = 128
  let body = ''
  top.forEach(([title, sub], i) => {
    body += box(xs[i], y1, w, h, title, sub, themes[0])
    if (i < n - 1) body += arrow(id, xs[i] + w + 2, y1 + h / 2, xs[i + 1] - 3, y1 + h / 2)
  })
  body += arrow(id, xs[n - 1] + w / 2, y1 + h + 2, xs[n - 1] + w / 2, y2 - 3)
  bottom.forEach(([title, sub], j) => {
    const i = n - 1 - j
    body += box(xs[i], y2, w, h, title, sub, themes[1])
    if (i > 0) body += arrow(id, xs[i] - 2, y2 + h / 2, xs[i - 1] + w + 3, y2 + h / 2)
  })
  body += arrow(id, xs[0] + w / 2, y2 - 2, xs[0] + w / 2, y1 + h + 3)
  return figure(y2 + h + 8, id, body, caption)
}

// ------------------------------------------------------------------------------------- the figures

const layer = (theme, name, note, chips) =>
  `<div class="layer ${theme}"><div class="layer-name"><b>${name}</b><span>${note}</span></div><div class="layer-items">${chips
    .map(([title, sub]) => `<div class="chip"><b>${title}</b><span>${sub}</span></div>`)
    .join('')}</div></div>`

const layers = `<figure><div class="layers">
${layer('blue', 'Pages (renderer)', 'One per window; React, no Node', [
  ['views/', 'a page per window'],
  ['components/', 'the panel’s parts'],
  ['character/', 'her pixel art'],
  ['lib/ hooks/', 'drawing, motion'],
])}
${layer('purple', 'Bridge (preload)', 'Hands each page window.assist', [['preload/index.ts', 'the only door']])}
${layer('green', 'Main: features', 'Bigger jobs, a file or folder each', [
  ['claudeDesktop.ts', 'asking Claude'],
  ['atlassian/', 'Jira'],
  ['apps/ mcp/', 'Apps list'],
  ['performances/', 'her tricks'],
  ['shell/', 'the taskbar'],
  ['updates.ts', 'updates'],
])}
${layer('amber', 'Main: core', 'Start-up, requests, the character', [
  ['index.ts', 'start-up, wiring'],
  ['ipc.ts', 'every request'],
  ['bubble/', 'BubbleController'],
  ['settings.ts storage/', 'files on disk'],
])}
${layer('grey', 'Shared', 'Compiled into all three', [['shared/', 'types, constants, the IPC contract']])}
</div><figcaption>The app’s parts. A page reaches the main process only through the bridge; each layer uses the ones below it, and <code>shared/</code> is compiled into every one.</figcaption></figure>`

const click = loop(
  'click',
  [
    ['You click', 'on her'],
    ['BubbleView', 'her page'],
    ['window.assist', 'the bridge'],
    ['ipc.ts', 'checks the sender'],
    ['BubbleController', 'decides'],
  ],
  [
    ['setMode', "'expanded'"],
    ['panel.show()', 'beside her'],
    ['mode-changed', 'to both pages'],
    ['PanelView', 're-renders open'],
    ['You see', 'the card'],
  ],
  'A click travels along the top, into the main process, and the answer comes back along the bottom.',
)

const modes = (() => {
  const id = 'modes'
  const w = 150
  const h = 46
  const at = {
    collapsed: [20, 30],
    expanded: [265, 30],
    capturing: [500, 30],
    returning: [20, 196],
    dragging: [265, 196],
  }
  const subs = {
    collapsed: 'standing on the taskbar',
    expanded: 'the panel is open',
    capturing: 'hidden for a screenshot',
    dragging: 'carried by the pointer',
    returning: 'falling or thrown',
  }
  let body = Object.entries(at)
    .map(([name, [x, y]]) =>
      box(x, y, w, h, name, subs[name], name === 'collapsed' ? 'green' : 'blue', true),
    )
    .join('')
  const c = (name) => ({ x: at[name][0], y: at[name][1] })
  // collapsed ⇄ expanded
  body += arrow(id, c('collapsed').x + w + 2, 46, c('expanded').x - 3, 46, { label: 'click' })
  body += arrow(id, c('expanded').x - 2, 64, c('collapsed').x + w + 3, 64, {
    label: 'click, Esc, focus lost',
    dy: 13,
  })
  // expanded ⇄ capturing
  body += arrow(id, c('expanded').x + w + 2, 46, c('capturing').x - 3, 46, { label: 'screenshot' })
  body += arrow(id, c('capturing').x - 2, 64, c('expanded').x + w + 3, 64, {
    label: 'saved',
    dy: 13,
  })
  // into dragging, from either
  body += arrow(id, c('expanded').x + w / 2, 78, c('dragging').x + w / 2, 193, {
    label: 'press and move',
    dx: 48,
    dy: 4,
  })
  body += arrow(id, c('collapsed').x + w - 20, 78, c('dragging').x + 20, 193, {
    label: 'press and move',
    dx: -14,
    dy: -8,
  })
  // dragging → returning → collapsed
  body += arrow(id, c('dragging').x - 2, 219, c('returning').x + w + 3, 219, { label: 'let go' })
  body += arrow(id, c('returning').x + 40, 193, c('collapsed').x + 40, 81, {
    label: 'lands',
    dx: -22,
    dy: 0,
  })
  body += `<text x="500" y="214" ${FONT} font-size="9.5" fill="${MUTED}">Caught in the air:</text>
<text x="500" y="228" ${FONT} font-size="9.5" fill="${MUTED}">returning → dragging again.</text>
<text x="500" y="242" ${FONT} font-size="9.5" fill="${MUTED}">Asleep (screen saver) and leaving</text>
<text x="500" y="256" ${FONT} font-size="9.5" fill="${MUTED}">(closing) are flags on top.</text>`
  return figure(
    262,
    id,
    body,
    'The bubble’s five modes (<code>Mode</code> in <code>shared/types.ts</code>) and what moves her between them.',
  )
})()

const weights = (() => {
  const id = 'weights'
  const x0 = 10
  const width = 660
  const bar = (y, segments, label) => {
    const total = segments.reduce((sum, s) => sum + s.w, 0)
    let x = x0
    let out = `<text x="${x0}" y="${y - 8}" ${FONT} font-size="10.5" font-weight="700" fill="${INK}">${esc(label)} <tspan font-weight="400" fill="${MUTED}">(the weights add up to ${total.toFixed(1)})</tspan></text>`
    for (const s of segments) {
      const w = (s.w / total) * width
      const t = THEMES[s.theme]
      out += `<rect x="${x}" y="${y}" width="${w}" height="28" fill="${t.fill}" stroke="${t.stroke}" stroke-width="0.9"/>`
      if (s.text) {
        out += `<text x="${x + w / 2}" y="${y + 18}" text-anchor="middle" ${FONT} font-size="9.5" fill="${INK}">${esc(s.text)}</text>`
      }
      x += w
    }
    return out
  }
  const weekday = [
    { w: 34.2, theme: 'blue', text: 'her habits' },
    { w: 2, theme: 'purple' },
    { w: 1.8, theme: 'amber' },
  ]
  const friday = [weekday[0], { w: 5, theme: 'green', text: 'confetti' }, weekday[1], weekday[2]]
  let body = bar(26, weekday, 'Wednesday, noon')
  body += bar(98, friday, 'Friday, 5pm')
  // The roll.
  const rollX = x0 + 0.42 * width
  body += arrow(id, rollX, 156, rollX, 129, { color: BLUE })
  body += `<text x="${rollX + 6}" y="160" ${FONT} font-size="9.5" fill="${BLUE}">random() × the total lands in one stretch: that’s what she does</text>`
  // The legend.
  const legend = [
    ['blue', 'habits: 1 each (the vision 0.2)'],
    ['green', 'confetti: 5, Fridays 4–8pm'],
    ['purple', 'peek, familiar: 1 each'],
    ['amber', 'tricks, portal, battle, watch: 0.2'],
  ]
  legend.forEach(([theme, text], i) => {
    const x = x0 + i * 167
    const t = THEMES[theme]
    body += `<rect x="${x}" y="178" width="12" height="12" rx="2" fill="${t.fill}" stroke="${t.stroke}"/><text x="${x + 17}" y="188" ${FONT} font-size="9.5" fill="${MUTED}">${esc(text)}</text>`
  })
  return figure(
    198,
    id,
    body,
    'Choosing a habit or a performance (<code>nextActivity</code>): every option gets a stretch as long as its weight, and a random point picks one. The timed habits join only in their hours.',
  )
})()

const trick = (() => {
  const id = 'trick'
  const w = 150
  const h = 50
  let body = ''
  const top = [
    ['ShellProbe', 'UI Automation: the buttons', 'grey'],
    ['appButtons()', 'the apps’ buttons, in DIPs', 'blue'],
    ['desktopCapturer', 'the icons, cut out locally', 'blue'],
    ['TrickPlan', 'where, which icons, when', 'purple'],
  ]
  const gap = (680 - 4 * w) / 3
  top.forEach(([t, s, theme], i) => {
    const x = i * (w + gap)
    body += box(x, 8, w, h, t, s, theme)
    if (i < 3) body += arrow(id, x + w + 2, 33, x + w + gap - 3, 33)
  })
  const planX = 3 * (w + gap) + w / 2
  body += box(90, 150, 230, h, 'BubbleController', 'moves her: trickFrame(plan, t)', 'green')
  body += box(380, 150, 230, h, 'TrickView window', 'draws the icons: trickFrame(plan, t)', 'green')
  body += arrow(id, planX - 30, 60, 210, 147, { label: 'the plan', dx: -30, dy: 2 })
  body += arrow(id, planX, 60, 495, 147, { label: 'plan + icons (IPC)', dx: 52, dy: 4 })
  body += `<text x="340" y="222" text-anchor="middle" ${FONT} font-size="9.5" fill="${MUTED}">The same plan and the same start time, so her moves and the icons stay in step without talking to each other.</text>`
  return figure(
    230,
    id,
    body,
    'A taskbar trick. Nothing on the taskbar is touched: its buttons are only looked at, and copies of their icons are drawn over it.',
  )
})()

const ask = sequence(
  'ask',
  ['Panel (page)', 'Main process', 'Clipboard', 'Claude Desktop'],
  [
    { from: 0, to: 1, label: 'claudeDesktop.ask(text)' },
    { from: 1, to: 2, label: 'screenshots, stacked into one image' },
    { from: 1, to: 3, label: 'open claude://claude.ai/new?q=…' },
    { from: 1, to: 0, label: '{ ok: true }: the panel closes' },
    { from: 1, to: 1, label: 'hidden PowerShell helper (UI Automation)' },
    { from: 1, to: 3, label: 'box holds exactly the question? Ctrl+V, Enter', blue: true },
    { from: 3, to: 3, label: 'Claude answers, in the user’s own account' },
  ],
  'Asking Claude. The question goes over a link; the helper presses keys only once it has found Claude’s text box holding exactly that question.',
)

const signIn = sequence(
  'signin',
  ['App (main)', 'Browser', 'Sign-in page'],
  [
    { from: 0, to: 0, label: 'listen on 127.0.0.1 (this PC only)' },
    { from: 0, to: 1, label: 'open the sign-in page (PKCE, state, nonce)' },
    { from: 1, to: 2, label: 'you sign in there' },
    { from: 2, to: 1, label: 'back to 127.0.0.1:port/callback?code=…' },
    { from: 1, to: 0, label: 'GET /callback: the listener catches it' },
    { from: 0, to: 2, label: 'code + PKCE verifier', blue: true },
    { from: 2, to: 0, label: 'tokens', blue: true },
    { from: 0, to: 0, label: 'saved encrypted (Windows DPAPI)' },
  ],
  'Signing in from a desktop app (JumpCloud for the built-in chat and the Apps list, Atlassian for Jira). Grey arrows pass through the browser; blue ones go straight between the app and the sign-in service.',
)

const release = loop(
  'release',
  [
    ['npm version', 'the new number'],
    ['electron-vite', 'builds out/'],
    ['electron-builder', 'the NSIS installer'],
    ['release-signing', 'writes .exe.sig'],
    ['installer/', 'committed, pushed'],
  ],
  [
    ['GitHub release', '.exe + .sig attached'],
    ['Updater', 'Check for updates'],
    ['Checked', 'size, SHA-256, signature'],
    ['Installer', '--updated /S --force-run'],
    ['New version', 'starts, data kept'],
  ],
  'From code to the PCs: <code>npm run dist</code> does the top row; a GitHub release and each copy’s Check for updates do the bottom.',
  { themes: ['purple', 'green'] },
)

export const FIGURES = { layers, click, modes, weights, trick, ask, signIn, release }
