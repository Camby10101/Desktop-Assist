import { randomUUID } from 'node:crypto'
import { promises as fs } from 'node:fs'
import { basename, resolve } from 'node:path'
import { z } from 'zod'
import type { Notes } from '@shared/types'
import { readJsonFile, writeJsonFile, writeJsonFileSync } from '../storage/jsonFile'

export const MAX_NOTE_LENGTH = 200_000

const NotesFileSchema = z.object({
  version: z.literal(1),
  text: z.string(),
  attachments: z.array(
    z.object({ id: z.string(), path: z.string(), fileName: z.string(), addedAt: z.string() }),
  ),
  updatedAt: z.string().nullable(),
})

export const emptyNotes = (): Notes => ({ text: '', attachments: [], updatedAt: null })

export interface NotesStoreOptions {
  debounceMs?: number
  /** Called when everything changed so far has reached the disk. */
  onSaved?: () => void
  onError?: (error: unknown) => void
  now?: () => Date
}

/**
 * The text box's contents. Changes are kept in memory and written to disk shortly after the
 * last edit; writes are serialised, and a write overtaken by a newer one is discarded.
 */
export class NotesStore {
  private notes: Notes = emptyNotes()
  private dirty = false
  private timer: ReturnType<typeof setTimeout> | null = null
  private writes: Promise<void> = Promise.resolve()
  private seq = 0
  private committedSeq = 0

  constructor(
    private readonly filePath: string,
    private readonly options: NotesStoreOptions = {},
  ) {}

  async load(): Promise<Notes> {
    const result = await readJsonFile(this.filePath, NotesFileSchema)
    if (result.status === 'ok') {
      const { text, attachments, updatedAt } = result.value
      this.notes = { text, attachments, updatedAt }
    } else {
      if (result.status === 'invalid') await this.setAsideCorruptFile()
      this.notes = emptyNotes()
    }
    return this.get()
  }

  get(): Notes {
    return { ...this.notes, attachments: this.notes.attachments.map((a) => ({ ...a })) }
  }

  setText(text: string): void {
    const next = text.slice(0, MAX_NOTE_LENGTH)
    if (next !== this.notes.text) this.update({ text: next })
  }

  /** Adds a screenshot to the text box. Returns null if that file is already attached. */
  addAttachment(path: string): Notes | null {
    if (this.notes.attachments.some((a) => samePath(a.path, path))) return null
    const attachment = {
      id: randomUUID(),
      path,
      fileName: basename(path),
      addedAt: this.now().toISOString(),
    }
    this.update({ attachments: [...this.notes.attachments, attachment] })
    return this.get()
  }

  removeAttachment(id: string): Notes {
    this.update({ attachments: this.notes.attachments.filter((a) => a.id !== id) })
    return this.get()
  }

  clear(): Notes {
    this.update({ text: '', attachments: [] })
    return this.get()
  }

  /** Writes any pending change now and waits for all writes to finish. */
  flush(): Promise<void> {
    this.clearTimer()
    if (this.dirty) {
      this.dirty = false
      const seq = ++this.seq
      const snapshot = this.toFile()
      this.writes = this.writes.then(() => this.write(snapshot, seq))
    }
    return this.writes
  }

  /** Blocking write for when the OS is ending the session and async work may never finish. */
  flushSync(): void {
    this.clearTimer()
    if (!this.dirty) return
    this.dirty = false
    const seq = ++this.seq
    writeJsonFileSync(this.filePath, this.toFile())
    this.committedSeq = seq
  }

  private update(patch: Partial<Notes>): void {
    this.notes = { ...this.notes, ...patch, updatedAt: this.now().toISOString() }
    this.dirty = true
    this.clearTimer()
    this.timer = setTimeout(() => void this.flush(), this.options.debounceMs ?? 500)
  }

  private async write(snapshot: object, seq: number): Promise<void> {
    try {
      const committed = await writeJsonFile(this.filePath, snapshot, () => seq > this.committedSeq)
      if (committed) this.committedSeq = seq
      if (!this.dirty) this.options.onSaved?.()
    } catch (error) {
      this.dirty = true // try again on the next change or flush
      this.options.onError?.(error)
    }
  }

  private toFile() {
    return { version: 1 as const, ...this.notes }
  }

  private async setAsideCorruptFile(): Promise<void> {
    const backup = `${this.filePath}.corrupt-${this.now().getTime()}`
    try {
      await fs.rename(this.filePath, backup)
    } catch (error) {
      this.options.onError?.(error)
    }
  }

  private clearTimer(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
  }

  private now(): Date {
    return this.options.now?.() ?? new Date()
  }
}

function samePath(a: string, b: string): boolean {
  const norm = (p: string) => resolve(p).toLowerCase()
  return norm(a) === norm(b)
}
