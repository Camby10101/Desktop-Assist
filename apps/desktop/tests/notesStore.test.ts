import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MAX_NOTE_LENGTH, NotesStore } from '../src/main/notes/NotesStore'

let dir: string
let file: string

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'desktop-assist-notes-'))
  file = join(dir, 'notes.json')
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

const readSaved = async () => JSON.parse(await readFile(file, 'utf8'))

describe('NotesStore', () => {
  it('starts empty when nothing has been saved', async () => {
    const store = new NotesStore(file)
    expect(await store.load()).toEqual({ text: '', attachments: [], updatedAt: null })
  })

  it('saves text after a short pause and restores it on the next load', async () => {
    const onSaved = vi.fn()
    const store = new NotesStore(file, { debounceMs: 20, onSaved })
    await store.load()
    store.setText('hello')
    await expect(readFile(file)).rejects.toThrow() // not written yet
    await vi.waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(await readSaved()).toMatchObject({ version: 1, text: 'hello', attachments: [] })

    const reloaded = new NotesStore(file)
    expect((await reloaded.load()).text).toBe('hello')
  })

  it('flush writes immediately', async () => {
    const store = new NotesStore(file, { debounceMs: 60_000 })
    await store.load()
    store.setText('now')
    await store.flush()
    expect((await readSaved()).text).toBe('now')
  })

  it('keeps only the newest text when a write is overtaken', async () => {
    const store = new NotesStore(file)
    await store.load()
    store.setText('older')
    const pending = store.flush()
    store.setText('newer')
    store.flushSync()
    await pending
    expect((await readSaved()).text).toBe('newer')
  })

  it('sets aside a corrupt file and starts fresh', async () => {
    await writeFile(file, '{ not json')
    const store = new NotesStore(file)
    expect((await store.load()).text).toBe('')
    const names = await readdir(dir)
    expect(names.some((name) => name.startsWith('notes.json.corrupt-'))).toBe(true)
  })

  it('treats a file with the wrong shape as corrupt', async () => {
    await writeFile(file, JSON.stringify({ version: 2, text: 5 }))
    const store = new NotesStore(file)
    expect((await store.load()).text).toBe('')
  })

  it('attaches each screenshot only once (paths compare case-insensitively)', async () => {
    const store = new NotesStore(file)
    await store.load()
    const first = store.addAttachment('C:\\Pics\\Shot.png')
    expect(first?.attachments).toHaveLength(1)
    expect(first?.attachments[0]?.fileName).toBe('Shot.png')
    expect(store.addAttachment('c:\\pics\\shot.png')).toBeNull()
  })

  it('removes attachments and clears everything', async () => {
    const store = new NotesStore(file)
    await store.load()
    store.setText('text')
    const withTwo = store.addAttachment('C:\\a.png')!
    store.addAttachment('C:\\b.png')
    expect(store.removeAttachment(withTwo.attachments[0]!.id).attachments).toHaveLength(1)
    const cleared = store.clear()
    expect(cleared.text).toBe('')
    expect(cleared.attachments).toEqual([])
  })

  it('caps very long text', async () => {
    const store = new NotesStore(file)
    await store.load()
    store.setText('x'.repeat(MAX_NOTE_LENGTH + 10))
    expect(store.get().text).toHaveLength(MAX_NOTE_LENGTH)
  })

  it('returns copies, so callers cannot change the stored notes', async () => {
    const store = new NotesStore(file)
    await store.load()
    store.addAttachment('C:\\a.png')
    const notes = store.get()
    notes.attachments.pop()
    expect(store.get().attachments).toHaveLength(1)
  })
})
