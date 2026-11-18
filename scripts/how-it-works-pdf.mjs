// Builds docs/how-it-works.pdf: "How the code works", a guided tour of the app for someone learning
// the code (the Code Guide, docs/CODE_GUIDE.pdf, is the full reference beside it).
//
// Run with Electron (`npm run docs:how`). The text is Markdown, one file per part, in
// docs/how-it-works/ (read in the order of the numbers they start with). Two extras on top of
// GitHub's Markdown:
//
//   > **Why it's built this way** …   A quote starting with one of the four titles in CALLOUTS
//                                       becomes a coloured box.
//   ```figure                          A code block of language "figure" naming a figure in
//   layers                             docs/how-it-works/figures.mjs is replaced by that figure.
//   ```
//
// It's printed twice: the first time to find which page each heading landed on (from the PDF's
// outline), the second with those page numbers filled into the contents.

import { app, BrowserWindow } from 'electron'
import { readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SOURCE = join(ROOT, 'docs', 'how-it-works')
const OUTPUT = join(ROOT, 'docs', 'how-it-works.pdf')
const TITLE = 'Desktop Wizard — How the code works'
/** Code blocks up to this many lines are kept on one page; longer ones may break across pages. */
const KEEP_TOGETHER_LINES = 42

/** The coloured boxes: a quote's opening bold words, and the box they make. */
const CALLOUTS = {
  "Why it's built this way": 'why',
  'Try it yourself': 'try',
  'Good to know': 'know',
  Security: 'security',
}

const { FIGURES } = await import(pathToFileURL(join(SOURCE, 'figures.mjs')).href)

const textOf = (node) =>
  node.type === 'text' ? node.value : (node.children ?? []).map(textOf).join('')

function walk(node, visit) {
  visit(node)
  for (const child of node.children ?? []) walk(child, visit)
}

const slug = (text) =>
  text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .trim()
    .replace(/\s+/g, '-')

/** The parts and sections, for the contents, as they're met. */
const headings = []

/** A rehype plugin: anchors on headings, the coloured boxes, and code blocks kept together. */
function prepare() {
  return (tree) => {
    walk(tree, (node) => {
      if (node.type !== 'element') return
      if (node.tagName === 'h1' || node.tagName === 'h2') {
        const text = textOf(node).trim()
        node.properties.id = slug(text)
        // The page about using the guide comes before the parts, and isn't in the contents.
        if (text !== 'How to use this guide') {
          headings.push({ level: node.tagName === 'h1' ? 1 : 2, text, id: node.properties.id })
        }
      }
      if (node.tagName === 'blockquote') {
        const first = node.children.find((c) => c.type === 'element')
        const strong = first?.children?.find((c) => c.type === 'element')
        const kind = strong?.tagName === 'strong' ? CALLOUTS[textOf(strong).trim()] : undefined
        if (kind) {
          node.properties.className = ['callout', kind]
          strong.properties.className = ['callout-title']
        }
      }
      if (node.tagName === 'pre') {
        const code = node.children.find((c) => c.tagName === 'code')
        const language = (code?.properties.className ?? []).find((c) => c.startsWith('language-'))
        if (language === 'language-figure') {
          node.properties.className = ['figure-slot']
          return
        }
        if (textOf(node).split('\n').length <= KEEP_TOGETHER_LINES) {
          node.properties.className = ['keep']
        }
      }
    })
  }
}

function renderPart(file) {
  const markdown = readFileSync(join(SOURCE, file), 'utf8')
  const html = renderToStaticMarkup(
    createElement(ReactMarkdown, {
      remarkPlugins: [remarkGfm],
      rehypePlugins: [prepare],
      children: markdown,
    }),
  )
  // Figures in place of their markers.
  return html.replace(
    /<pre class="figure-slot"><code class="language-figure">([\s\S]*?)<\/code><\/pre>/g,
    (_, name) => {
      const figure = FIGURES[name.trim()]
      if (!figure) throw new Error(`${file}: no figure called "${name.trim()}"`)
      return figure
    },
  )
}

/** The contents, with each heading's page from `pages` (its id → page), blank the first time. */
function contents(pages) {
  const rows = headings.map(({ level, text, id }) => {
    const page = pages?.get(id) ?? ''
    return `<a class="toc-row level-${level}" href="#${id}"><span class="toc-text">${escape(text)}</span><span class="toc-dots"></span><span class="toc-page">${page}</span></a>`
  })
  return `<section class="contents"><h1 class="contents-title">Contents</h1>${rows.join('')}</section>`
}

const escape = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

function page(parts, pages) {
  const version = JSON.parse(
    readFileSync(join(ROOT, 'apps', 'desktop', 'package.json'), 'utf8'),
  ).version
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${TITLE}</title>
<style>${STYLES}</style></head><body>
<section class="cover">
  <div class="band"></div>
  <div class="cover-body">
    <h1 class="cover-title">Desktop Wizard</h1>
    <p class="cover-subtitle">How the code works</p>
    <p class="cover-intro">A guided tour of every part of the app and how the parts work together, from a
    click on the character to the installer on GitHub.</p>
  </div>
  <p class="cover-meta">Repository: <code>Camby10101/Desktop-Wizard</code> (GitHub), code as of version
  ${version}.<br>Written for learning: read it alongside the code. The Code Guide
  (<code>docs/CODE_GUIDE.pdf</code>) has every function in full.</p>
</section>
${contents(pages)}
${parts.join('\n')}
</body></html>`
}

// --------------------------------------------------------------------------------- page numbers

/**
 * The page (from 1) of each named destination in a PDF Chromium printed. Every heading in the
 * contents is a link's target, so each one is a named destination, with the page it's on.
 */
function destinationPages(pdf) {
  const text = pdf.toString('latin1')
  const objects = new Map()
  for (const m of text.matchAll(/(\d+) 0 obj\b([\s\S]*?)\bendobj/g)) objects.set(Number(m[1]), m[2])
  const pagesRoot = [...objects].find(
    ([, body]) => /\/Type\s*\/Pages\b/.test(body) && !/\/Parent\b/.test(body),
  )
  if (!pagesRoot) throw new Error("Couldn't find the PDF's pages")
  const order = []
  const visit = (id) => {
    const body = objects.get(id) ?? ''
    if (/\/Type\s*\/Pages\b/.test(body)) {
      const kids = body.match(/\/Kids\s*\[([^\]]*)\]/)?.[1] ?? ''
      for (const kid of kids.matchAll(/(\d+) 0 R/g)) visit(Number(kid[1]))
    } else order.push(id)
  }
  visit(pagesRoot[0])
  const pageOf = new Map(order.map((id, index) => [id, index + 1]))
  const dests = text.match(/\/Dests\s+(\d+) 0 R/)
  const pages = new Map()
  if (!dests) return pages
  for (const m of (objects.get(Number(dests[1])) ?? '').matchAll(
    /\/([^\s/[\]<>()]+)\s*\[\s*(\d+) 0 R/g,
  )) {
    pages.set(m[1], pageOf.get(Number(m[2])))
  }
  return pages
}

// --------------------------------------------------------------------------------------- printing

async function print(html) {
  const file = join(tmpdir(), `how-it-works-${process.pid}.html`)
  writeFileSync(file, html)
  const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true } })
  try {
    await win.loadFile(file)
    return await win.webContents.printToPDF({
      printBackground: true,
      preferCSSPageSize: true,
      generateDocumentOutline: true,
      generateTaggedPDF: true,
    })
  } finally {
    win.destroy()
    rmSync(file, { force: true })
  }
}

// The first pass's window closes before the second's opens: that mustn't quit the app.
app.on('window-all-closed', () => {})

app
  .whenReady()
  .then(async () => {
    const files = readdirSync(SOURCE)
      .filter((name) => /^\d+-.*\.md$/.test(name))
      .sort((a, b) => parseInt(a) - parseInt(b))
    const parts = files.map(renderPart)
    const first = await print(page(parts, null))
    const pages = destinationPages(first)
    const missing = headings.filter((h) => !pages.has(h.id))
    if (missing.length) {
      throw new Error(`No page found for: ${missing.map((h) => h.text).join('; ')}`)
    }
    const pdf = await print(page(parts, pages))
    writeFileSync(OUTPUT, pdf)
    console.log(
      `Wrote ${relative(ROOT, OUTPUT)} (${Math.round(pdf.length / 1024)} KB, ${pages.get(headings.at(-1).id)}+ pages, ${headings.length} contents entries)`,
    )
    app.exit(0)
  })
  .catch((error) => {
    console.error(error)
    app.exit(1)
  })

// ----------------------------------------------------------------------------------------- styles

const STYLES = `
@page {
  size: A4;
  margin: 22mm 18mm 18mm 18mm;
  @top-left {
    content: "${TITLE}";
    font: 7.5pt "Segoe UI", sans-serif;
    color: #6b7280;
    vertical-align: bottom;
    padding-bottom: 2.2mm;
    border-bottom: 0.6pt solid #e5e7eb;
  }
  @bottom-right { content: counter(page); font: 7.5pt "Segoe UI", sans-serif; color: #6b7280; }
}
@page :first {
  margin: 0;
  @top-left { content: none; border: 0; }
  @bottom-right { content: none; }
}
:root {
  --ink: #1f2328; --muted: #57606a; --line: #e3e6ea; --blue: #2563eb; --deep: #1e40af;
  --code: #1e4f9c; --code-bg: #f6f7f9;
}
* { box-sizing: border-box; }
html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { margin: 0; color: var(--ink); font: 9.8pt/1.5 "Segoe UI", system-ui, sans-serif; }
a { color: inherit; text-decoration: none; }
code, pre { font-family: "Cascadia Mono", Consolas, monospace; }
strong { font-weight: 650; }

/* The cover */
.cover { height: 297mm; position: relative; break-after: page; }
.cover .band { height: 17mm; background: var(--blue); }
.cover-body { position: absolute; left: 24mm; right: 24mm; top: 112mm; }
.cover-title { font-size: 36pt; line-height: 1.15; margin: 0; font-weight: 700; break-before: avoid; color: var(--ink); }
.cover-subtitle { font-size: 36pt; line-height: 1.15; margin: 0 0 12mm; font-weight: 700; color: var(--blue); }
.cover-intro { font-size: 15pt; line-height: 1.45; color: var(--muted); margin: 0; max-width: 165mm; }
.cover-meta { position: absolute; left: 24mm; right: 24mm; top: 205mm; font-size: 9.5pt; color: var(--muted); }
.cover-meta code { color: var(--code); font-size: 8.8pt; }

/* The contents */
.contents { break-after: page; }
h1.contents-title { break-before: avoid; margin-top: 0; }
.toc-row { display: flex; align-items: baseline; gap: 1.5mm; font-size: 9.6pt; line-height: 1.95; }
.toc-row.level-1 { font-weight: 700; font-size: 10.6pt; margin-top: 4.5mm; }
.toc-row.level-2 { padding-left: 5mm; }
.toc-dots { flex: 1; border-bottom: 1.3pt dotted #9ca3af; transform: translateY(-1.2mm); }
.toc-row.level-1 .toc-dots { border-color: transparent; }
.toc-page { min-width: 7mm; text-align: right; }

/* Headings */
h1, h2, h3, h4 { break-after: avoid; line-height: 1.25; }
h1 { break-before: page; font-size: 25pt; color: var(--deep); margin: 0 0 3mm; font-weight: 700; }
h1[id^='part'] + p { font-size: 12pt; line-height: 1.5; color: var(--muted); margin-bottom: 7mm; }
h2 { font-size: 16.5pt; margin: 8mm 0 2.5mm; font-weight: 700; }
h3 { font-size: 12pt; margin: 6mm 0 1.6mm; font-weight: 600; }
h4 { font-size: 9.8pt; margin: 4.8mm 0 1mm; font-family: "Cascadia Mono", Consolas, monospace; color: var(--code); font-weight: 700; }
h4 code { color: inherit; font-size: inherit; }
h1 code, h2 code, h3 code { font-size: 0.9em; color: inherit; }

p { margin: 0 0 2.4mm; orphans: 3; widows: 3; }
ul, ol { margin: 0 0 2.8mm; padding-left: 5.5mm; }
li { margin: 0.6mm 0; }
li > p { margin: 0; }
:not(pre) > code { color: var(--code); font-size: 8.6pt; }

/* Tables */
table { border-collapse: collapse; width: 100%; margin: 1mm 0 4mm; font-size: 8.7pt; line-height: 1.4; }
thead { display: table-header-group; }
tr { break-inside: avoid; }
th { background: #f1f3f5; text-align: left; font-weight: 650; padding: 1.8mm 2.2mm; border-bottom: 1.2pt solid #6b7280; }
td { padding: 1.6mm 2.2mm; border-bottom: 0.6pt solid var(--line); vertical-align: top; }
td code, th code { font-size: 8.1pt; }

/* Code */
pre { margin: 1.2mm 0 3.6mm; padding: 2.8mm 3.4mm; background: var(--code-bg); border: 0.7pt solid #dfe3e8;
  border-radius: 1mm; font-size: 7.6pt; line-height: 1.45; white-space: pre-wrap; overflow-wrap: anywhere; color: #24292f; }
pre code { color: inherit; font-size: inherit; }
pre.keep { break-inside: avoid; }

/* The coloured boxes */
.callout { break-inside: avoid; margin: 3mm 0 4mm; padding: 2.8mm 4mm 2.2mm; border-left: 1.3mm solid; border-radius: 0.6mm; }
.callout p { margin: 0 0 1.4mm; }
.callout .callout-title { display: block; margin-bottom: 0.6mm; }
.callout.why { background: #e8effd; border-color: #2563eb; }
.callout.why .callout-title { color: #2563eb; }
.callout.try { background: #e9f6ec; border-color: #15803d; }
.callout.try .callout-title { color: #15803d; }
.callout.know { background: #fdf4dd; border-color: #b45309; }
.callout.know .callout-title { color: #b45309; }
.callout.security { background: #efeafc; border-color: #6d4fc9; }
.callout.security .callout-title { color: #6d4fc9; }
.callout pre { background: rgba(255, 255, 255, 0.6); }

/* Figures */
figure { margin: 4mm 0 5mm; break-inside: avoid; counter-increment: figure; }
figure svg { display: block; width: 100%; height: auto; }
figcaption { font-size: 8.4pt; color: var(--muted); font-style: italic; margin-top: 2mm; }
figcaption::before { content: "Figure " counter(figure) ". "; }
.layers { display: flex; flex-direction: column; gap: 2.2mm; }
.layer { display: flex; align-items: center; gap: 3mm; padding: 2.6mm 3.2mm; border-radius: 1.6mm; }
.layer-name { width: 47mm; flex: none; }
.layer-name b { display: block; font-size: 10pt; }
.layer-name span { font-size: 7.6pt; color: var(--muted); }
.layer-items { display: flex; flex-wrap: wrap; gap: 2mm; flex: 1; }
.chip { background: #fff; border: 0.9pt solid; border-radius: 1.4mm; padding: 1.2mm 2.4mm; text-align: center; min-width: 26mm; }
.chip b { display: block; font: 700 8.2pt "Cascadia Mono", Consolas, monospace; }
.chip span { display: block; font-size: 7pt; color: var(--muted); }
.layer.blue { background: #e8effd; } .layer.blue .chip { border-color: #2563eb; }
.layer.purple { background: #efeafc; } .layer.purple .chip { border-color: #6d4fc9; }
.layer.green { background: #e3f4ea; } .layer.green .chip { border-color: #15803d; }
.layer.amber { background: #fdf4dd; } .layer.amber .chip { border-color: #b45309; }
.layer.grey { background: #f1f3f5; } .layer.grey .chip { border-color: #6b7280; }
`
