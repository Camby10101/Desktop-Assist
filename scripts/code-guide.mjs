// Keeps the code shown in the Code Guide identical to the real source.
//
// In docs/code-guide/*.md, a block like
//
//   <!-- code: apps/desktop/src/main/auth/AuthManager.ts#AuthManager.signIn -->
//   <!-- /code -->
//
// is filled with that piece of source code (plus a link to the lines it came from).
// The part after `#` picks what to show:
//
//   (nothing)          the whole file
//   name               a top-level function, class, const, interface or type
//   a,b                several top-level declarations, one after another
//   Outer.inner        something declared inside Outer: a class member (method, field, getter,
//                      `constructor`) or a function or const inside a function
//   Outer.a,b          several things inside Outer
//   Class.class        just a class's comment and declaration line, with its body left out
//
// Comments directly above a declaration are included. Run `npm run docs` after changing code;
// `npm run docs:check` (also part of `npm test`) fails if the guide is out of date.

import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, extname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const BLOCK = /<!-- code: ([^#\s]+)(?:#(\S+))? -->\n[\s\S]*?<!-- \/code -->/g
const LANGUAGES = {
  '.ts': 'ts',
  '.tsx': 'tsx',
  '.mjs': 'js',
  '.css': 'css',
  '.html': 'html',
  '.json': 'json',
  '.yml': 'yaml',
}

/** The guide's Markdown files. */
export function guideFiles() {
  const dir = join(ROOT, 'docs', 'code-guide')
  return readdirSync(dir)
    .filter((name) => name.endsWith('.md'))
    .map((name) => join(dir, name))
}

/**
 * Fills every code block. Returns the files that changed (or, with `check`, would change).
 * `only` limits it to one guide file.
 */
export function syncCodeGuide({ check = false, only } = {}) {
  const changed = []
  const files = only ? [resolve(ROOT, only)] : guideFiles()
  for (const file of files) {
    const before = readFileSync(file, 'utf8')
    const after = before.replace(BLOCK, (_match, path, selector) =>
      renderBlock(file, path, selector),
    )
    if (after !== before) {
      changed.push(relative(ROOT, file))
      if (!check) writeFileSync(file, after)
    }
  }
  return changed
}

function renderBlock(guideFile, path, selector) {
  const source = readFileSync(join(ROOT, path), 'utf8').replace(/\r\n/g, '\n')
  const { code, from, to } = selector ? extract(path, source, selector) : wholeFile(source)
  const link = relative(dirname(guideFile), join(ROOT, path)).replaceAll('\\', '/')
  const where = from === to ? `line ${from}` : `lines ${from}–${to}`
  const language = LANGUAGES[extname(path)] ?? ''
  return [
    `<!-- code: ${path}${selector ? `#${selector}` : ''} -->`,
    '', // Prettier's layout, so formatting the guide doesn't make it look out of date
    `[\`${path.replace('apps/desktop/', '')}\`, ${where}](${link}#L${from}${to > from ? `-L${to}` : ''})`,
    '',
    '```' + language,
    code,
    '```',
    '',
    '<!-- /code -->',
  ].join('\n')
}

function wholeFile(source) {
  const code = source.replace(/\n+$/, '')
  return { code, from: 1, to: code.split('\n').length }
}

function extract(path, source, selector) {
  const sourceFile = ts.createSourceFile(
    path,
    source,
    ts.ScriptTarget.Latest,
    true,
    scriptKind(path),
  )
  const [outer, inner] = selector.includes('.') ? splitOnce(selector, '.') : [null, selector]
  const scope = outer ? findIn(sourceFile, outer, path, selector) : sourceFile
  const pieces = inner
    .split(',')
    .map((name) =>
      name === 'class' && ts.isClassDeclaration(scope)
        ? classHead(sourceFile, source, scope)
        : piece(sourceFile, source, findIn(scope, name, path, selector)),
    )
  return {
    code: pieces.map((p) => p.code).join('\n\n'),
    from: Math.min(...pieces.map((p) => p.from)),
    to: Math.max(...pieces.map((p) => p.to)),
  }
}

function splitOnce(text, separator) {
  const at = text.indexOf(separator)
  return [text.slice(0, at), text.slice(at + 1)]
}

function scriptKind(path) {
  return path.endsWith('.tsx')
    ? ts.ScriptKind.TSX
    : path.endsWith('.mjs')
      ? ts.ScriptKind.JS
      : ts.ScriptKind.TS
}

/** The declaration called `name` directly inside `scope` (a file, class, or function body). */
function findIn(scope, name, path, selector) {
  for (const node of children(scope)) {
    if (nameOf(node) === name) return node
  }
  throw new Error(`${path}#${selector}: can't find "${name}"`)
}

function children(scope) {
  if (ts.isSourceFile(scope)) return scope.statements
  if (ts.isClassDeclaration(scope)) return scope.members
  if (ts.isVariableStatement(scope)) {
    // `const x = () => {...}` or `const x = {...}`: look inside the value.
    const init = scope.declarationList.declarations[0]?.initializer
    if (init && (ts.isArrowFunction(init) || ts.isFunctionExpression(init)))
      return bodyStatements(init)
    if (init && ts.isObjectLiteralExpression(init)) return init.properties
    return []
  }
  if (ts.isFunctionDeclaration(scope) || ts.isMethodDeclaration(scope)) return bodyStatements(scope)
  return []
}

function bodyStatements(fn) {
  if (!fn.body) return []
  if (ts.isBlock(fn.body)) return fn.body.statements
  return []
}

function nameOf(node) {
  if (ts.isConstructorDeclaration(node)) return 'constructor'
  if (ts.isVariableStatement(node)) {
    const names = node.declarationList.declarations.map((d) => d.name.getText())
    return names.length === 1 ? names[0] : undefined
  }
  if (ts.isExpressionStatement(node)) return undefined
  return node.name?.getText()
}

/** The node's text from the start of its leading comment, dedented. */
function piece(sourceFile, source, node, end = node.getEnd(), suffix = '') {
  const comments = ts.getLeadingCommentRanges(source, node.getFullStart()) ?? []
  const start = comments.length ? comments[0].pos : node.getStart(sourceFile)
  const lineStart = source.lastIndexOf('\n', start - 1) + 1
  const text = source.slice(lineStart, end).trimEnd() + suffix
  const lines = text.split('\n')
  const indent = Math.min(...lines.filter((l) => l.trim()).map((l) => l.match(/^ */)[0].length))
  return {
    code: lines.map((l) => l.slice(indent)).join('\n'),
    from: sourceFile.getLineAndCharacterOfPosition(lineStart).line + 1,
    to: sourceFile.getLineAndCharacterOfPosition(end).line + 1,
  }
}

/** A class's comment and `class … {` line, then `// …` in place of its members. */
function classHead(sourceFile, source, node) {
  // members.pos is just after the class's opening brace.
  return piece(sourceFile, source, node, node.members.pos, '\n  // …\n}')
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const check = process.argv.includes('--check')
  const onlyAt = process.argv.indexOf('--only')
  const only = onlyAt > 0 ? process.argv[onlyAt + 1] : undefined
  try {
    const changed = syncCodeGuide({ check, only })
    if (check && changed.length) {
      console.error(`The Code Guide is out of date (${changed.join(', ')}). Run: npm run docs`)
      process.exitCode = 1
    } else {
      console.log(
        changed.length ? `Updated ${changed.join(', ')}` : 'The Code Guide is up to date.',
      )
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  }
}
