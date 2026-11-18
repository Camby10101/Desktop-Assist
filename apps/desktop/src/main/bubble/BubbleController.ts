import {
  DRAG_CHECK,
  FIDGET_MS,
  LANDING,
  REACTION_MS,
  REACTIONS,
  SPELL_POSE_MS,
  isFidget,
  type Fidget,
  type Pose,
  type Reaction,
  type SpellPose,
} from '@shared/character'
import {
  bubbleMetrics,
  isLeftCorner,
  isTopCorner,
  largestSize,
  snapSize,
  DEFAULT_SIZE,
  UI,
  type CharacterSize,
  type Corner,
  type Point,
  type Rect,
} from '@shared/geometry'
import type { Habits, Mode } from '@shared/types'
import {
  bubbleWindowBounds,
  insetAt,
  maxInset,
  nearestCorner,
  panelWindowBounds,
  restPosition,
} from './layout'
import {
  FLING,
  WANDER,
  activityDelay,
  fallDuration,
  fallPosition,
  flightStep,
  impactSpeed,
  isHardLanding,
  pointerReaction,
  POINTER,
  releaseVelocity,
  type PerformanceName,
  type PointerSample,
  nextActivity,
  type Pastimes,
  walkStep,
  walkTarget,
} from './wander'

/** The parts of a window the controller drives. Electron windows are adapted in windows.ts. */
export interface Surface {
  setBounds(bounds: Rect): void
  show(): void
  hide(): void
}

export interface PanelSurface extends Surface {
  focus(): void
}

/** One display: its id, its whole screen, and its work area (the screen minus the taskbar). */
export interface DisplayArea {
  id: number
  bounds: Rect
  workArea: Rect
}

/** What the controller needs to know about the screens. Electron's `screen` is adapted in index.ts. */
export interface Displays {
  primary(): DisplayArea
  byId(id: number): DisplayArea | undefined
  /** The display containing `point`, or the closest one. */
  nearest(point: Point): DisplayArea
  /** Where the mouse pointer is. */
  cursor(): Point
}

/** Where the character lives: near a bottom corner of a particular display. */
export interface BubbleAnchor {
  displayId: number
  corner: Corner
}

/**
 * One of her performances, under way (see Performer): where her box is and what she's doing at
 * each moment.
 */
export interface Performance {
  /** At `t` ms since it began: where her box is (DIP) and her pose; null once it's over. */
  at(t: number): { x: number; y: number; pose: Pose } | null
  /** It's over: finished, or cut short (the user picked her up, say). */
  end(finished: boolean): void
}

/**
 * Her performances (wander.ts PERFORMANCES): what can be done just now, and getting one ready
 * (looking at the taskbar's icons or the windows on the screen, say), or null if it can't be.
 */
export interface Performer {
  /** The performances that can be done now; `canMove` is false when she's to stand still. */
  available(canMove: boolean): readonly PerformanceName[]
  prepare(
    name: PerformanceName,
    standing: { workArea: Rect; bounds: Rect; scale: number; box: Point },
  ): Promise<Performance | null>
}

export interface BubbleControllerDeps {
  bubble: Surface
  panel: PanelSurface
  displays: Displays
  actionCount: number
  /** Where the bubble was last time, if saved. */
  initialAnchor?: BubbleAnchor | null
  /** Her size last time (see CHARACTER_SIZES), if saved. */
  initialScale?: number | null
  /** Whether she stands still, and does her idle animations (Settings); she does both if not. */
  initialHabits?: Habits
  onModeChange(mode: Mode): void
  /** The character settled near the other bottom corner or on another display. */
  onAnchorChange(anchor: BubbleAnchor): void
  /** What the character is doing changed (the bubble's page animates it). */
  onPoseChange?(pose: Pose): void
  /** Her size changed, or the biggest she can be on her screen did. */
  onSizeChange?(size: CharacterSize): void
  now?: () => number
  random?: () => number
  /** Her performances (the taskbar tricks and the like), if there are any. */
  performer?: Performer
  /** Things worth a line in the log, such as a click on the bubble that didn't open it. */
  onDiagnostic?: (message: string) => void
}

/** Poses she's in when not doing anything in particular (anything else stops when she's interrupted). */
const MOVING: readonly Pose[] = ['idle', 'walk-left', 'walk-right', 'dragged', 'flung']

const isReaction = (pose: Pose): pose is Reaction => (REACTIONS as readonly string[]).includes(pose)

/** What she may do on her own, from the Settings (both, unless they say otherwise). */
function pastimesOf(habits?: Habits): Pastimes {
  return { walk: !habits?.standStill, fidget: !habits?.noIdles }
}

const FRAME_MS = 16
const DEFAULT_CORNER: Corner = 'bottom-right'
/** Matches the panel's fade-out in the renderer, so the window hides once it's invisible. */
export const PANEL_FADE_MS = 150
/**
 * Clicking the bubble while the panel is open blurs the panel as the button goes down (the bubble
 * takes the focus), so the panel has already closed when the click arrives. When the click says
 * when it was pressed, a panel that closed after that press (give or take this much) closed
 * because of it, and stays closed. Without that time, a click this soon after a blur-collapse is
 * taken to be the same gesture.
 */
export const BLUR_CLICK_GRACE_MS = 300
export const PRESS_SLACK_MS = 50
/**
 * A blur this soon after the panel opened doesn't close it. Another app can take the focus back
 * just as the panel opens (Claude Desktop, say, right after a question was handed to it); closing
 * then would make the click look like it did nothing. The panel stays open, unfocused, instead.
 */
export const OPEN_BLUR_GRACE_MS = 400
/** Lets Windows repaint the area under our windows before a screenshot. */
export const HIDE_SETTLE_MS = 150

/**
 * The bubble's state machine. The bubble is a character standing on the taskbar near one of the
 * bottom corners. This owns the mode, the character's position, its pose and its anchor (the
 * display and bottom corner it lives near), and moves/shows/hides the two windows to match:
 *
 *   collapsed ⇄ expanded                     click, Esc, blur
 *   collapsed/expanded → dragging → returning → collapsed     drag, release (falls to the taskbar)
 *   expanded → capturing → expanded          screenshot
 *
 * While collapsed and left alone, it wanders: now and then it walks somewhere else near its corner
 * and, once it's been alone a while, sometimes fidgets instead. Dropped far from its corner, it
 * walks back. Anything the user does stops it where it is.
 *
 * It also owns her size (`scale`, one of CHARACTER_SIZES): the size the user chose, kept to the
 * biggest that fits her display, with both windows sized and placed to match.
 */
export class BubbleController {
  private mode: Mode = 'collapsed'
  private pose: Pose = 'idle'
  private position: Point = { x: 0, y: 0 }
  private anchor: BubbleAnchor
  /** How far along the taskbar from its corner it stands (see restPosition). */
  private inset = 0
  /** The size the user chose (saved), and the size she is: that, or less if it doesn't fit. */
  private chosenScale: number
  private scale: number
  private ticker: ReturnType<typeof setInterval> | null = null
  private hideTimer: ReturnType<typeof setTimeout> | null = null
  /** The next thing it does on its own, or the end of a fidget. */
  private idleTimer: ReturnType<typeof setTimeout> | null = null
  private walking = false
  /** The fidget (or performance) she did last, so the next one is different. */
  private lastFidget: Fidget | PerformanceName | undefined
  /** When the user last did something with it (a mode change); fidgets wait for a quiet spell. */
  private lastInteraction: number
  private lastBlurCollapse = Number.NEGATIVE_INFINITY
  private expandedAt = Number.NEGATIVE_INFINITY
  private expandAfterReturn = false
  /** She's vanishing as the app closes (farewell): she does nothing more, whatever's clicked. */
  private leaving = false
  /** What she may do on her own (Settings: Stand still, No idle animations). */
  private pastimes: Pastimes
  /** While she's carried: when her page last said the mouse button is still down (DRAG_CHECK). */
  private lastHeld = 0
  /** While she's carried: where the pointer has been lately, for how fast she's thrown. */
  private pointerTrail: PointerSample[] = []
  /** The performance under way, if one is. */
  private performance: Performance | null = null
  /** Counts performances asked for, so one that's ready after she's been interrupted is dropped. */
  private performances = 0
  /** The end of a reaction played while the panel's open (or of a pet), if one is playing. */
  private reactionTimer: ReturnType<typeof setTimeout> | null = null
  /** Watching the pointer for her reactions (see watchPointer), and when she last reacted. */
  private pointerWatch: ReturnType<typeof setInterval> | null = null
  private pointerSeen: PointerSample[] = []
  private lastReaction = Number.NEGATIVE_INFINITY
  /** She's away while the screen saver is on (sleep): hidden, doing nothing, until wake(). */
  private asleep = false
  private sleepTimer: ReturnType<typeof setTimeout> | null = null
  private readonly now: () => number
  private readonly random: () => number

  constructor(private readonly deps: BubbleControllerDeps) {
    // Wall-clock time, so it compares with the time a click was pressed in the bubble's page.
    this.now = deps.now ?? (() => Date.now())
    this.random = deps.random ?? Math.random
    this.lastInteraction = this.now()
    // Set now, not in start(): the pages ask for the corner as soon as they load, which can be
    // before start() runs. A top corner saved by an older version means the bottom one below it.
    const saved = deps.initialAnchor
    const corner = bottomOf(saved?.corner ?? DEFAULT_CORNER)
    this.anchor =
      saved && deps.displays.byId(saved.displayId)
        ? { displayId: saved.displayId, corner }
        : { displayId: deps.displays.primary().id, corner }
    this.pastimes = pastimesOf(deps.initialHabits)
    this.chosenScale = snapSize(deps.initialScale ?? DEFAULT_SIZE)
    this.scale = Math.min(this.chosenScale, this.largestScale())
  }

  get currentMode(): Mode {
    return this.mode
  }

  get currentPose(): Pose {
    return this.pose
  }

  get bubblePosition(): Point {
    return { ...this.position }
  }

  get corner(): Corner {
    return this.anchor.corner
  }

  /** How big she is, and the biggest she can be on her display. */
  get size(): CharacterSize {
    return { scale: this.scale, max: this.largestScale() }
  }

  /**
   * Where she stands, for her clones, her vision and her spells' effects: her display's work area,
   * her window, and her size.
   */
  get standing(): { workArea: Rect; bounds: Rect; scale: number } {
    return {
      workArea: this.display().workArea,
      bounds: bubbleWindowBounds(this.position, this.scale),
      scale: this.scale,
    }
  }

  /**
   * Makes her `scale` times her usual size (snapped to one of CHARACTER_SIZES), or as big as fits
   * her display if that's smaller. She grows or shrinks where she stands: her feet stay on the
   * taskbar and her side nearest her corner stays put. Both windows are resized to match.
   */
  setScale(scale: number): CharacterSize {
    this.chosenScale = snapSize(scale)
    this.fitScale()
    return this.size
  }

  /**
   * Whether she wanders about and does her idle animations on her own (Settings). A walk of her
   * own that's no longer allowed stops where she is; a fidget plays out.
   */
  setHabits(habits: Habits): void {
    this.pastimes = pastimesOf(habits)
    if (this.mode !== 'collapsed' || this.leaving || this.asleep) return
    if (this.walking && !this.pastimes.walk) this.stopWalking()
    if (this.pose === 'idle') this.scheduleActivity(false)
  }

  /** Stands the character in its saved corner (or bottom-right of the main display) and shows it. */
  start(): void {
    this.position = this.rest()
    this.placeWindows()
    this.deps.bubble.show()
    this.scheduleActivity(true)
    this.pointerWatch = setInterval(() => this.watchPointer(), POINTER.everyMs)
  }

  /** Where she stands just now, for her performances: as `standing`, and her box's top-left. */
  get standingBox(): { workArea: Rect; bounds: Rect; scale: number; box: Point } {
    return { ...this.standing, box: { ...this.position } }
  }

  /**
   * Plays one of her reactions (REACTIONS) for its time: double-clicked (`pet`), a notification
   * (`scroll`), the pointer (`startle`, `pounce-…`). With the panel closed it's like any of her
   * habits (see act); with it open, she still plays it, and stands idle again after.
   */
  react(pose: Reaction): void {
    if (this.leaving || this.asleep) return
    if (this.mode === 'collapsed') {
      this.act(pose)
      return
    }
    if (this.mode !== 'expanded') return
    if (this.reactionTimer) clearTimeout(this.reactionTimer)
    this.setPose(pose)
    this.reactionTimer = setTimeout(() => {
      this.reactionTimer = null
      if (this.pose === pose) this.setPose('idle')
    }, REACTION_MS[pose])
  }

  /** Double-clicked: hearts and a happy wiggle (the click before it opened or closed the panel). */
  pet(): void {
    this.react('pet')
  }

  /** A click on the bubble. `pressedAt` is when its mouse button went down (wall-clock ms). */
  clickBubble(pressedAt?: number): void {
    if (this.leaving || this.asleep) return
    switch (this.mode) {
      case 'collapsed': {
        const closedByThisPress =
          pressedAt === undefined
            ? this.now() - this.lastBlurCollapse < BLUR_CLICK_GRACE_MS
            : this.lastBlurCollapse >= pressedAt - PRESS_SLACK_MS
        if (closedByThisPress) return // the press closed the panel: that was the click's job
        this.expand()
        return
      }
      case 'expanded':
        this.collapse()
        return
      case 'dragging':
        // A click while she's carried: the button came up without the drag hearing of it (a
        // release can go missing when the PC is busy). This is the user letting go.
        this.deps.onDiagnostic?.('Bubble clicked while carried: letting go')
        this.endDrag()
        return
      case 'returning':
      case 'capturing':
        this.deps.onDiagnostic?.(`Bubble click ignored while ${this.mode}`)
        return
    }
  }

  /** Opens the panel where the character stands. While she's falling, once she lands. */
  expand(): void {
    if (this.leaving || this.asleep) return
    switch (this.mode) {
      case 'expanded':
        this.deps.panel.focus()
        return
      case 'returning':
        this.expandAfterReturn = true
        return
      case 'dragging':
      case 'capturing':
        return
      case 'collapsed':
        this.cancelHide()
        // Stops any walk first, which puts the panel where the character now stands.
        this.setMode('expanded')
        this.expandedAt = this.now()
        this.deps.panel.show()
        this.deps.panel.focus()
        return
    }
  }

  collapse(): void {
    if (this.mode !== 'expanded') return
    this.setMode('collapsed')
    this.cancelHide()
    this.hideTimer = setTimeout(() => {
      this.hideTimer = null
      this.deps.panel.hide()
    }, PANEL_FADE_MS)
  }

  panelBlurred(): void {
    if (this.mode !== 'expanded') return
    if (this.now() - this.expandedAt < OPEN_BLUR_GRACE_MS) {
      this.deps.onDiagnostic?.('The panel lost the focus as it opened; kept it open')
      return
    }
    this.lastBlurCollapse = this.now()
    this.collapse()
  }

  /** The mouse pressed on the character and moved: it dangles from the pointer until released. */
  startDrag(): void {
    if (this.leaving || this.asleep) return
    // Caught in the air too, falling or thrown.
    if (this.mode !== 'collapsed' && this.mode !== 'expanded' && this.mode !== 'returning') return
    this.expandAfterReturn = false
    this.cancelHide()
    this.deps.panel.hide()
    this.setMode('dragging')
    const cursor = this.deps.displays.cursor()
    const grab = { x: cursor.x - this.position.x, y: cursor.y - this.position.y }
    this.lastHeld = this.now()
    this.pointerTrail = [{ t: this.now(), ...cursor }]
    this.runTicker(() => {
      // No word for a while that the button's still down (DRAG_CHECK): let her go rather than
      // leave her stuck to the pointer.
      if (this.now() - this.lastHeld > DRAG_CHECK.staleMs) {
        this.deps.onDiagnostic?.('Drag ended: no word that the mouse button is still down')
        this.endDrag()
        return
      }
      const now = this.deps.displays.cursor()
      this.pointerTrail.push({ t: this.now(), ...now })
      if (this.pointerTrail.length > 20) this.pointerTrail.shift()
      this.moveBubble({ x: now.x - grab.x, y: now.y - grab.y })
    })
  }

  /** While she's carried, her page says the mouse button is still down (see DRAG_CHECK). */
  dragHeld(): void {
    if (this.mode === 'dragging') this.lastHeld = this.now()
  }

  /**
   * Released: the character falls onto the taskbar of the display it was dropped on, and from then
   * on lives near that display's nearer bottom corner. Dropped far from it, it walks back. Let go
   * while the pointer's moving, she's thrown instead (see fling).
   */
  endDrag(): void {
    if (this.mode !== 'dragging') return
    this.stopTicker()
    const velocity = releaseVelocity(this.pointerTrail, this.now())
    this.pointerTrail = []
    if (Math.hypot(velocity.x, velocity.y) >= FLING.minSpeed) {
      this.fling(velocity)
      return
    }
    const half = bubbleMetrics(this.scale).size / 2
    const centre = {
      x: Math.round(this.position.x + half),
      y: Math.round(this.position.y + half),
    }
    const display = this.deps.displays.nearest(centre)
    const corner = nearestCorner(display.workArea, this.position, this.scale)
    this.setAnchor({ displayId: display.id, corner })
    // Another display may not have room for her at this size.
    this.fitScale()
    this.inset = insetAt(display.workArea, corner, this.position.x, this.scale)
    this.fall()
  }

  /**
   * Plays one of her poses on purpose for its time: a spell's (SPELL_POSES), or a fidget as she
   * casts one of the others. Then `then`, or, without one, she stands idle again and gets on with
   * her day. As with a fidget, anything the user does stops it (and `then` never comes).
   * Collapsed only: casting a spell closes the panel first.
   */
  act(pose: Fidget | SpellPose | Reaction | 'splat', then?: () => void): void {
    if (this.mode !== 'collapsed') return
    this.stopIdling()
    this.setPose(pose)
    this.idleTimer = setTimeout(
      () => {
        this.idleTimer = null
        if (then) return then()
        this.setPose('idle')
        this.scheduleActivity(false)
      },
      isFidget(pose)
        ? FIDGET_MS[pose]
        : pose === 'splat'
          ? LANDING.splatMs
          : isReaction(pose)
            ? REACTION_MS[pose]
            : SPELL_POSE_MS[pose],
    )
  }

  /**
   * Her teleport spell: she vanishes, and appears again somewhere else along the taskbar near her
   * corner (at least WANDER.minWalk away, when there's room), the panel moved to open from there.
   */
  teleport(): void {
    this.act('vanish', () => {
      this.inset = walkTarget(this.inset, this.zone(), this.random())
      this.position = this.rest()
      this.placeWindows()
      this.act('appear')
    })
  }

  /**
   * Closing the app: the panel closes, and she vanishes into white motes where she is (her
   * `vanish` pose); then `done` (which quits). From then on she does nothing more, and clicking or
   * dragging her does nothing: she's leaving.
   */
  farewell(done: () => void): void {
    if (this.leaving) return
    this.collapse()
    this.leaving = true
    this.stopIdling()
    this.stopTicker()
    this.setPose('vanish')
    setTimeout(done, SPELL_POSE_MS.vanish)
  }

  /**
   * The screen saver's starting: the panel closes and she vanishes into white motes as the screens
   * whiten (her `vanish` pose), then her window hides. She does nothing more until wake().
   */
  sleep(): void {
    if (this.leaving || this.asleep) return
    this.collapse()
    this.asleep = true
    this.stopIdling()
    this.stopTicker()
    this.walking = false
    this.setPose('vanish')
    this.sleepTimer = setTimeout(() => {
      this.sleepTimer = null
      this.deps.bubble.hide()
    }, SPELL_POSE_MS.vanish)
  }

  /** The screen saver's over: her window shows again, she forms out of white motes, and carries on. */
  wake(): void {
    if (!this.asleep) return
    this.asleep = false
    if (this.sleepTimer) clearTimeout(this.sleepTimer)
    this.sleepTimer = null
    this.position = this.rest()
    this.placeWindows()
    this.deps.bubble.show()
    this.act('appear')
  }

  /** Hides both windows, runs `task` (a screenshot), then reopens the panel. */
  async whileHidden<T>(task: () => Promise<T>): Promise<T> {
    if (this.mode !== 'expanded') throw new Error(`Can't hide the windows while ${this.mode}`)
    this.setMode('capturing')
    this.deps.panel.hide()
    this.deps.bubble.hide()
    try {
      await new Promise((resolve) => setTimeout(resolve, HIDE_SETTLE_MS))
      return await task()
    } finally {
      this.deps.bubble.show()
      this.setMode('expanded')
      this.expandedAt = this.now()
      this.deps.panel.show()
      this.deps.panel.focus()
    }
  }

  /**
   * The resolution, taskbar or monitors changed. If the character's display was unplugged, it
   * moves to the same corner of the main display. Her size is kept to what fits (and back to the
   * size chosen once there's room again). Moving characters re-read the display every frame; one
   * standing (or strolling) is put back on the taskbar, as far from its corner as fits.
   */
  displayChanged(): void {
    if (!this.deps.displays.byId(this.anchor.displayId)) {
      this.setAnchor({ displayId: this.deps.displays.primary().id, corner: this.anchor.corner })
    }
    this.fitScale()
    if (this.mode === 'returning' || this.mode === 'dragging') return
    // Asleep (the screen saver), she stays gone: she's placed afresh as she wakes.
    if (!this.asleep) this.stopIdling()
    this.inset = Math.min(this.inset, maxInset(this.display().workArea, this.scale))
    this.position = this.rest()
    this.placeWindows()
    if (this.mode === 'collapsed') this.scheduleActivity(false)
  }

  dispose(): void {
    this.stopTicker()
    this.cancelHide()
    this.cancelActivity()
    if (this.sleepTimer) clearTimeout(this.sleepTimer)
    if (this.reactionTimer) clearTimeout(this.reactionTimer)
    if (this.pointerWatch) clearInterval(this.pointerWatch)
    this.performances++
    this.endPerformance(false)
  }

  /** The anchor's display, or the main display if it's gone. */
  private display(): DisplayArea {
    return this.deps.displays.byId(this.anchor.displayId) ?? this.deps.displays.primary()
  }

  /** Where the character stands now: on the taskbar, `inset` from its corner. */
  private rest(): Point {
    return restPosition(this.display().workArea, this.anchor.corner, this.inset, this.scale)
  }

  /** The biggest she can be on her display (see largestSize). */
  private largestScale(): number {
    return largestSize(this.display().workArea, this.deps.actionCount)
  }

  /**
   * Makes her the size chosen, or the biggest that fits her display, and tells the pages if that
   * (or the biggest) changed. Standing or strolling, she's put back on the taskbar at her new size
   * and both windows are sized to match; moving, the next frame does that.
   */
  private fitScale(): void {
    const before = this.size
    this.scale = Math.min(this.chosenScale, this.largestScale())
    const after = this.size
    if (after.scale === before.scale && after.max === before.max) return
    if (this.mode === 'collapsed' || this.mode === 'expanded') {
      this.inset = Math.min(this.inset, maxInset(this.display().workArea, this.scale))
      this.position = this.rest()
      this.placeWindows()
    }
    this.deps.onSizeChange?.(after)
  }

  /** After a drop: falls onto the taskbar, then walks back toward its corner if it's far off. */
  private fall(): void {
    const from = { ...this.position }
    const duration = fallDuration(from, this.rest())
    // Dropped from high up, she lands hard.
    const impact = impactSpeed(this.rest().y - from.y)
    const startedAt = this.now()
    this.setMode('returning')
    this.runTicker(() => {
      const to = this.rest()
      const t = (this.now() - startedAt) / duration
      if (t < 1) {
        this.moveBubble(fallPosition(from, to, t))
        return
      }
      this.land(impact)
    })
  }

  /**
   * Thrown: she flies on at the pointer's speed (`velocity`, DIP per second), tumbling, under
   * gravity, turned back by the sides and top of the display she was let go on, until she lands
   * on its taskbar (flightStep); from then on she lives near its nearer bottom corner.
   */
  private fling(velocity: Point): void {
    const { size, pad } = bubbleMetrics(this.scale)
    const display = this.deps.displays.nearest({
      x: Math.round(this.position.x + size / 2),
      y: Math.round(this.position.y + size / 2),
    })
    const area = display.workArea
    const room = {
      minX: area.x + UI.edgeMargin,
      maxX: area.x + area.width - UI.edgeMargin - size,
      minY: area.y,
      floor: area.y + area.height - pad - size,
    }
    let flight = { ...this.position, vx: velocity.x, vy: velocity.y }
    this.setMode('returning')
    this.setPose('flung')
    this.runTicker((dtMs) => {
      const step = flightStep(flight, dtMs, room)
      flight = step.flight
      this.moveBubble({ x: flight.x, y: flight.y })
      if (!step.landed) return
      const corner = nearestCorner(area, this.position, this.scale)
      this.setAnchor({ displayId: display.id, corner })
      this.fitScale()
      this.inset = insetAt(area, corner, this.position.x, this.scale)
      this.land(step.impact)
    })
  }

  /**
   * Down on the taskbar after a fall or a throw (landing at `impact`, DIP per second): standing,
   * and opening if that was asked for. A hard landing knocks her flat first (her `splat` pose).
   * Then, far from her corner, she walks back (unless she's to stand still).
   */
  private land(impact: number): void {
    this.settle()
    const walkBack = () => {
      const far = this.inset > this.zone()
      if (this.mode === 'collapsed' && far && this.pastimes.walk) this.walkTo(this.zone())
    }
    if (this.mode === 'collapsed' && isHardLanding(impact)) {
      this.act('splat', () => {
        this.setPose('idle')
        this.scheduleActivity(false)
        walkBack()
      })
    } else {
      walkBack()
    }
  }

  /** The end of a fall: standing, collapsed, and opening if that was asked for. */
  private settle(): void {
    this.stopTicker()
    this.position = this.rest()
    this.placeWindows()
    this.setMode('collapsed')
    if (this.expandAfterReturn) {
      this.expandAfterReturn = false
      this.expand()
    }
  }

  /** How far from its corner it wanders on its display: further when she's bigger. */
  private zone(): number {
    const zone = WANDER.zone * Math.max(1, this.scale)
    return Math.min(zone, maxInset(this.display().workArea, this.scale))
  }

  /**
   * Waits a while, then does something on its own (see doActivity). Collapsed only, and never if
   * she's neither to walk nor to fidget.
   */
  private scheduleActivity(first: boolean): void {
    this.cancelActivity()
    if (this.mode !== 'collapsed' || this.leaving || this.asleep) return
    if (!this.pastimes.walk && !this.pastimes.fidget) return
    this.idleTimer = setTimeout(() => this.doActivity(), activityDelay(this.random, first))
  }

  private doActivity(): void {
    this.idleTimer = null
    if (this.mode !== 'collapsed') return
    const idleMs = this.now() - this.lastInteraction
    const activity = nextActivity(
      idleMs,
      this.inset,
      this.zone(),
      this.random,
      this.lastFidget,
      this.pastimes,
      {
        when: new Date(this.now()),
        performances: this.deps.performer?.available(this.pastimes.walk) ?? [],
      },
    )
    if (activity.kind === 'rest') {
      this.scheduleActivity(false)
      return
    }
    if (activity.kind === 'perform') {
      this.lastFidget = activity.name
      this.prepare(activity.name)
      return
    }
    if (activity.kind === 'walk') {
      this.walkTo(activity.to)
      return
    }
    this.lastFidget = activity.pose
    this.setPose(activity.pose)
    this.idleTimer = setTimeout(() => {
      this.idleTimer = null
      this.setPose('idle')
      this.scheduleActivity(false)
    }, FIDGET_MS[activity.pose])
  }

  /** Walks along the taskbar to `target` (an inset), then waits for the next thing to do. */
  private walkTo(target: number): void {
    this.cancelActivity()
    const to = Math.min(Math.max(target, 0), maxInset(this.display().workArea, this.scale))
    if (Math.abs(to - this.inset) < 1) {
      this.scheduleActivity(false)
      return
    }
    // Insets grow toward the middle: from the right-hand corner, that's walking left.
    const inward = to > this.inset
    const left = isLeftCorner(this.anchor.corner) ? !inward : inward
    this.walking = true
    this.setPose(left ? 'walk-left' : 'walk-right')
    this.runTicker((dtMs) => {
      // Her steps are as long as she is big, so she walks faster the bigger she is.
      this.inset = walkStep(this.inset, to, dtMs, WANDER.walkSpeed * this.scale)
      this.moveBubble(this.rest())
      if (this.inset !== to) return
      this.stopWalking()
      this.scheduleActivity(false)
    })
  }

  /** Stops a walk where it is, standing idle, with the panel moved to open from there. */
  private stopWalking(): void {
    if (!this.walking) return
    this.walking = false
    this.stopTicker()
    this.position = this.rest()
    this.placeWindows()
    this.setPose('idle')
  }

  /** Stops whatever it was doing on its own: the next activity, a fidget or a spell, a walk. */
  private stopIdling(): void {
    this.cancelActivity()
    this.stopWalking()
    // A performance being got ready is dropped when it's ready; one under way ends here.
    this.performances++
    this.endPerformance(false)
    if (this.reactionTimer) clearTimeout(this.reactionTimer)
    this.reactionTimer = null
    if (!MOVING.includes(this.pose)) this.setPose('idle')
  }

  /** Gets a performance ready (see Performer), then plays it, if nothing's happened meanwhile. */
  private prepare(name: PerformanceName): void {
    const performer = this.deps.performer
    if (!performer) return this.scheduleActivity(false)
    const asked = ++this.performances
    performer
      .prepare(name, this.standingBox)
      .catch((error: unknown) => {
        this.deps.onDiagnostic?.(`Getting ${name} ready failed: ${String(error)}`)
        return null
      })
      .then((performance) => {
        if (
          asked !== this.performances ||
          this.mode !== 'collapsed' ||
          this.leaving ||
          this.asleep
        ) {
          performance?.end(false)
          return
        }
        if (!performance) return this.scheduleActivity(false)
        this.perform(performance)
      })
  }

  /** Plays a performance: each frame, she's where it says, doing what it says, until it's over. */
  private perform(performance: Performance): void {
    this.cancelActivity()
    this.performance = performance
    const startedAt = this.now()
    this.runTicker(() => {
      const step = performance.at(this.now() - startedAt)
      if (!step) {
        this.endPerformance(true)
        return
      }
      if (step.pose !== this.pose) this.setPose(step.pose)
      this.moveBubble({ x: step.x, y: step.y })
    })
  }

  /**
   * The performance is over (`finished`) or cut short: she stands on the taskbar where she's got
   * to (or straight below it), and, finished, gets on with her day.
   */
  private endPerformance(finished: boolean): void {
    const performance = this.performance
    if (!performance) return
    this.performance = null
    this.stopTicker()
    performance.end(finished)
    const area = this.display().workArea
    this.inset = Math.min(
      Math.max(0, insetAt(area, this.anchor.corner, this.position.x, this.scale)),
      maxInset(area, this.scale),
    )
    this.position = this.rest()
    this.placeWindows()
    if (finished) {
      this.setPose('idle')
      this.scheduleActivity(false)
    }
  }

  /**
   * Every POINTER.everyMs while she's standing about on her own: where the pointer is. Zipping
   * past close to her, it startles her; wiggled near her, she pounces at it. Now and then, not
   * every time (POINTER.chance), and not again for a while (POINTER.restMs).
   */
  private watchPointer(): void {
    const free =
      this.mode === 'collapsed' && this.pose === 'idle' && !this.walking && !this.performance
    if (!free || this.leaving || this.asleep) {
      this.pointerSeen = []
      return
    }
    const now = this.now()
    const cursor = this.deps.displays.cursor()
    this.pointerSeen.push({ t: now, ...cursor })
    this.pointerSeen = this.pointerSeen.filter((s) => s.t >= now - POINTER.wiggleMs)
    if (now - this.lastReaction < POINTER.restMs) return
    const size = bubbleMetrics(this.scale).size
    const her = { x: this.position.x + size / 2, y: this.position.y + size / 2 }
    const reaction = pointerReaction(this.pointerSeen, her, this.scale)
    if (!reaction) return
    this.lastReaction = now
    if (this.random() >= POINTER.chance) return
    this.pointerSeen = []
    this.act(reaction)
  }

  private cancelActivity(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer)
    this.idleTimer = null
  }

  private runTicker(onFrame: (dtMs: number) => void): void {
    this.stopTicker()
    let last = this.now()
    this.ticker = setInterval(() => {
      const now = this.now()
      onFrame(now - last)
      last = now
    }, FRAME_MS)
  }

  private stopTicker(): void {
    if (this.ticker) clearInterval(this.ticker)
    this.ticker = null
  }

  private moveBubble(position: Point): void {
    this.position = position
    this.deps.bubble.setBounds(bubbleWindowBounds(position, this.scale))
  }

  private placeWindows(): void {
    this.deps.bubble.setBounds(bubbleWindowBounds(this.position, this.scale))
    this.deps.panel.setBounds(
      panelWindowBounds(this.position, this.deps.actionCount, this.anchor.corner, this.scale),
    )
  }

  private setAnchor(anchor: BubbleAnchor): void {
    if (anchor.displayId === this.anchor.displayId && anchor.corner === this.anchor.corner) return
    this.anchor = anchor
    this.deps.onAnchorChange({ ...anchor })
  }

  private cancelHide(): void {
    if (this.hideTimer) clearTimeout(this.hideTimer)
    this.hideTimer = null
  }

  /**
   * Every change of mode is something the user did (or the end of it), so it restarts the quiet
   * spell, stops anything the character was doing on its own, and sets its pose: dangling while
   * it's moved about, standing otherwise. Back to collapsed, it waits to do something again.
   */
  private setMode(mode: Mode): void {
    if (mode === this.mode) return
    if (this.mode === 'collapsed') this.stopIdling()
    this.mode = mode
    this.lastInteraction = this.now()
    this.deps.onModeChange(mode)
    this.setPose(mode === 'dragging' || mode === 'returning' ? 'dragged' : 'idle')
    if (mode === 'collapsed') this.scheduleActivity(false)
  }

  private setPose(pose: Pose): void {
    if (pose === this.pose) return
    this.pose = pose
    this.deps.onPoseChange?.(pose)
  }
}

/** The bottom corner on the same side: the character always stands at the bottom. */
function bottomOf(corner: Corner): Corner {
  if (!isTopCorner(corner)) return corner
  return isLeftCorner(corner) ? 'bottom-left' : 'bottom-right'
}
