// Builds docs/CODE_GUIDE.pdf: the Code Guide overview and every walkthrough page in one PDF.
//
// Run with Electron (`npm run docs:pdf`), which turns the Markdown into a styled page with the
// same Markdown and code-highlighting libraries the app uses for Claude's replies, then prints it.
// Each page starts on a new sheet; links between pages jump within the PDF, and links to source
// files go to GitHub. Run `npm run docs` first so the code shown is current.

import { app, BrowserWindow } from 'electron'
import { readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, posix, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import ReactMarkdown from 'react-markdown'
import rehypeHighlight from 'rehype-highlight'
import remarkGfm from 'remark-gfm'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const GUIDE_DIR = join(ROOT, 'docs', 'code-guide')
const OUTPUT = join(ROOT, 'docs', 'CODE_GUIDE.pdf')
const REPO_URL = 'https://github.com/Camby10101/Desktop-Assist/blob/main/'
const PAGES = [
  'CODE_GUIDE.md',
  '1-shared-and-preload.md',
  '2-main-startup.md',
  '3-sign-in.md',
  '4-claude.md',
  '5-bubble.md',
  '6-drafts-and-screenshots.md',
  '7-renderer-pages.md',
  '8-renderer-components.md',
]
/** Code blocks up to this many lines are kept on one sheet; longer ones may break across sheets. */
const KEEP_TOGETHER_LINES = 45

const pageId = (file) => file.replace(/\.md$/, '').toLowerCase()

/** GitHub's heading anchors: lowercase, punctuation removed, spaces to hyphens, repeats numbered. */
function slugger() {
  const seen = new Map()
  return (text) => {
    const base = text
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s_-]/gu, '')
      .replace(/\s/g, '-')
    const count = seen.get(base) ?? 0
    seen.set(base, count + 1)
    return count ? `${base}-${count}` : base
  }
}

const textOf = (node) =>
  node.type === 'text' ? node.value : (node.children ?? []).map(textOf).join('')

function walk(node, visit, parent = null) {
  visit(node, parent)
  for (const child of node.children ?? []) walk(child, visit, node)
}

/**
 * A rehype plugin for one page: gives headings anchors unique across the whole PDF, points links
 * at the right place, marks the "file, lines" caption above each code block, and marks short code
 * blocks so they aren't split across sheets.
 */
function preparePage(file) {
  const id = pageId(file)
  const slug = slugger()
  const linkTarget = (href) => {
    if (/^[a-z]+:/i.test(href)) return href // http(s), mailto
    if (href.startsWith('#')) return `#${id}--${href.slice(1)}`
    const [path, anchor] = href.split('#')
    if (PAGES.includes(path)) return anchor ? `#${pageId(path)}--${anchor}` : `#${pageId(path)}`
    // Anything else is a file in the repository: link to it on GitHub.
    const target = posix.normalize(posix.join('docs/code-guide', path))
    return REPO_URL + encodeURI(target) + (anchor ? `#${anchor}` : '')
  }
  return () => (tree) => {
    walk(tree, (node, parent) => {
      if (node.type !== 'element') return
      if (/^h[1-6]$/.test(node.tagName)) {
        node.properties.id = node.tagName === 'h1' ? id : `${id}--${slug(textOf(node))}`
      }
      if (node.tagName === 'a' && typeof node.properties.href === 'string') {
        const source = node.properties.href.includes('apps/desktop/') && parent?.tagName === 'p'
        node.properties.href = linkTarget(node.properties.href)
        if (source && parent.children.filter((c) => c.type === 'element').length === 1) {
          parent.properties.className = ['source']
        }
      }
      if (node.tagName === 'pre') {
        const lines = textOf(node).split('\n').length
        if (lines <= KEEP_TOGETHER_LINES) node.properties.className = ['keep']
      }
    })
  }
}

function renderPage(file) {
  const markdown = readFileSync(join(GUIDE_DIR, file), 'utf8')
    .replace(/<!-- \/?code[^>]*-->\n?/g, '') // the generator's markers
    .replace(/^\[← Code Guide\]\(CODE_GUIDE\.md\)\n/m, '') // the PDF has its own contents
  const body = renderToStaticMarkup(
    createElement(ReactMarkdown, {
      remarkPlugins: [remarkGfm],
      rehypePlugins: [[rehypeHighlight, { detect: false }], preparePage(file)],
      children: markdown,
    }),
  )
  return `<section class="page">${body}</section>`
}

function contents() {
  const items = PAGES.map((file) => {
    const markdown = readFileSync(join(GUIDE_DIR, file), 'utf8')
    const title = file === 'CODE_GUIDE.md' ? 'Overview' : (markdown.match(/^# (.+)$/m)?.[1] ?? file)
    return `<li><a href="#${pageId(file)}">${title.replace(/`/g, '')}</a></li>`
  })
  return `<ol class="contents">${items.join('')}</ol>`
}

function html() {
  const logo = readFileSync(join(ROOT, 'tenants', 'morse-micro', 'logo.png')).toString('base64')
  const highlight = readFileSync(
    join(ROOT, 'node_modules', 'highlight.js', 'styles', 'github.css'),
    'utf8',
  )
  const date = new Date().toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Desktop Assist Code Guide</title>
<style>${highlight}${STYLES}</style></head><body>
<section class="cover">
  <img src="data:image/png;base64,${logo}" alt="">
  <h1 class="title">Desktop Assist</h1>
  <p class="subtitle">Code Guide</p>
  <p class="meta">Morse Micro · ${date}</p>
  <p class="intro">How the app fits together, and the actual code of every function and method with an
  explanation. Each part starts on a new page; links within the guide jump to the right place, and
  each code block's caption links to its lines on GitHub.</p>
  <h2>Contents</h2>${contents()}
</section>
${PAGES.map(renderPage).join('\n')}
</body></html>`
}

const STYLES = `
@page { size: A4; margin: 16mm 15mm 18mm 15mm; }
:root { --accent: #7e22ce; --ink: #1f2328; --muted: #59636e; --line: #d8dee4; --code-bg: #f6f8fa; }
* { box-sizing: border-box; }
html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { margin: 0; color: var(--ink); background: #fff; font: 10pt/1.55 "Segoe UI", system-ui, sans-serif; }
a { color: var(--accent); text-decoration: none; }
code, pre { font-family: "Cascadia Mono", Consolas, monospace; }

.cover { min-height: 255mm; display: flex; flex-direction: column; justify-content: center; }
.cover img { width: 34mm; height: 34mm; }
.cover .title { font-size: 34pt; margin: 8mm 0 0; border: 0; color: var(--ink); }
.cover .subtitle { font-size: 20pt; margin: 0; color: var(--accent); font-weight: 600; }
.cover .meta { color: var(--muted); margin: 2mm 0 8mm; }
.cover .intro { max-width: 150mm; color: var(--muted); }
.cover h2 { margin-top: 10mm; }
.contents { padding-left: 6mm; font-size: 11pt; line-height: 1.9; }

.page { break-before: page; }
h1, h2, h3, h4 { line-height: 1.3; break-after: avoid; }
h1 { font-size: 22pt; margin: 0 0 4mm; padding-bottom: 2mm; border-bottom: 2px solid var(--accent); }
h2 { font-size: 14.5pt; margin: 9mm 0 3mm; padding-bottom: 1.2mm; border-bottom: 1px solid var(--line); }
h3 { font-size: 11.5pt; margin: 7mm 0 2mm; color: #2d2a32; }
h4 { font-size: 10.5pt; margin: 5mm 0 2mm; }
h1 code, h2 code, h3 code, h4 code { font-size: 0.92em; background: none !important; padding: 0 !important; color: var(--accent) !important; }
p { margin: 0 0 2.6mm; orphans: 3; widows: 3; }
ul, ol { margin: 0 0 3mm; padding-left: 6mm; }
li { margin: 0.8mm 0; }
li > p { margin: 0; }
hr { border: 0; border-top: 1px solid var(--line); margin: 6mm 0; }
blockquote { margin: 0 0 3mm; padding: 1mm 4mm; border-left: 3px solid var(--line); color: var(--muted); }
:not(pre) > code { font-size: 8.8pt; background: #f3eff9; color: #3b2a55; padding: 0.1mm 0.6mm; border-radius: 2px; }
table { border-collapse: collapse; margin: 0 0 4mm; font-size: 9pt; break-inside: avoid; }
th, td { border: 1px solid var(--line); padding: 1.2mm 2.5mm; text-align: left; vertical-align: top; }
th { background: var(--code-bg); }

p.source { margin: 4mm 0 0; font-size: 8pt; break-after: avoid; }
p.source a { color: var(--muted); }
p.source code { background: none; padding: 0; color: var(--muted); font-size: 8pt; }
pre { margin: 1mm 0 3.5mm; padding: 2.6mm 3.2mm; background: var(--code-bg); border: 1px solid var(--line);
  border-left: 3px solid var(--accent); border-radius: 4px; font-size: 7.9pt; line-height: 1.45;
  white-space: pre-wrap; overflow-wrap: anywhere; }
pre.keep { break-inside: avoid; }
pre code.hljs { padding: 0; background: none; }
`

app
  .whenReady()
  .then(async () => {
    const page = join(tmpdir(), `code-guide-${process.pid}.html`)
    writeFileSync(page, html())
    const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true } })
    await win.loadFile(page)
    const pdf = await win.webContents.printToPDF({
      printBackground: true,
      preferCSSPageSize: true,
      displayHeaderFooter: true,
      headerTemplate: '<span></span>',
      footerTemplate: `<div style="width:100%;font:8px 'Segoe UI',sans-serif;color:#8c959f;text-align:center">
      Desktop Assist Code Guide · <span class="pageNumber"></span> / <span class="totalPages"></span></div>`,
      generateDocumentOutline: true,
      generateTaggedPDF: true,
    })
    writeFileSync(OUTPUT, pdf)
    rmSync(page, { force: true })
    console.log(`Wrote ${relative(ROOT, OUTPUT)} (${Math.round(pdf.length / 1024)} KB)`)
    app.exit(0)
  })
  .catch((error) => {
    console.error(error)
    app.exit(1)
  })
