# Customizing her

How to add to the character: a habit, a toy or visitor, something drawn round her, a reaction, a
performance, a window of effects, a colour. Each kind of thing has one place that lists it, and
TypeScript or the tests refuse a half-finished one, so the steps below are short. Paths are under
`apps/desktop/src/`.

## Where everything is

| What                                                | Where                                                                                                          |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Her habits: each one's length, kind and how likely  | `HABIT_LIST` in `shared/character.ts`                                                                          |
| Her reactions, spell poses and held poses           | `REACTIONS` / `REACTION_MS`, `SPELL_POSES`, `HELD_POSES` in `shared/character.ts`                              |
| Every pose's move (its frames, and if it loops)     | `renderer/src/character/moves/`: a file per kind, all listed in `moves/index.ts`                               |
| The tools moves are made with                       | `moves/kit.ts`: `hold`, `tween`, `through`, `once`, `repeating`, stock arms (`OUT_SIDE`, `CUPPED` …)           |
| Things drawn round her (toys, effects, visitors)    | `renderer/src/character/props/`: a painter per thing, with its pictures and timetable; the order in `index.ts` |
| Her body, face, hair, robe and hat                  | `renderer/src/character/rig.ts` (`Pose`, `draw()`), drawn with `raster.ts`; hand-drawn views in `pictures.ts`  |
| Her colours                                         | letters to CSS classes in `renderer/src/character/palette.ts`; the colours in `components/character.css`       |
| Her performances: how likely, whether they move her | `PERFORMANCE_LIST` in `main/bubble/wander.ts`; each one made in `main/performances/`, plugged in by `index.ts` |
| Windows of effects over the screen                  | `shared/views.ts` (names), `renderer/src/views/` (pages), `renderer/src/main.tsx` (which page for which)       |
| Spells                                              | `shared/spells.ts`, their effects in `renderer/src/lib/spells/`                                                |
| The screen saver's scenes                           | `renderer/src/lib/screensaver/`                                                                                |
| Her familiar, the cat                               | `renderer/src/character/cat.ts`, moved by `renderer/src/lib/familiar.ts`                                       |

A **habit's kind** says where its pieces are: `everyday` (`moves/everyday.ts`, `props/everyday.ts`),
`charm` (`charms.ts`), `magic` (`magic.ts`), `toy` (`toys.ts`) or `visitor` (`visitors.ts`).

Frames are drawn, not loaded: every frame is a grid 96 pixels wide and 104 tall (8 rows of headroom
above her hat), one palette letter a pixel (`.` is see-through). She's always drawn facing right;
facing left is the same frame mirrored.

## Add a habit

Say she's to blow a dandelion, its seeds drifting off.

1. **Name it.** In `shared/character.ts`, add an entry to `HABIT_LIST` with a comment saying what she
   does (it shows when you hover the name anywhere):

   ```ts
   /** Blows a dandelion clock; its seeds drift away on the breeze, and she smiles. */
   dandelion: { ms: 4000, kind: 'charm' },
   ```

   TypeScript now refuses to build until the next step is done.

2. **Move her.** In the file for its kind (`renderer/src/character/moves/charms.ts`), write its
   move: a list of key poses (`Key`), each a `Pose` and how long it shows. `through(ms, t => pose)`
   makes one a frame every 40 ms from a function of how far through it is (0 to 1); `hold` and
   `tween` build one from fixed poses. Copy a habit that's close (`butterfly`, `bubbles`) and change
   it. Then add it to the list at the bottom of the file:

   ```ts
   // (`dandelion: t` tells the rig how far through it is: the field comes in step 3.)
   function dandelion(): Key[] {
     return through(FIDGET_MS.dandelion, (t) => ({
       view: 'diagonal',
       face: t < 0.3 ? 'neutral' : 'happy',
       dandelion: t,
       arms: [toward(OUT_FRONT, between(t, 0, 0.1)), ARM_DOWN],
     }))
   }
   // …
   export const CHARM_MOVES = {
     // …
     dandelion: once(dandelion),
   } satisfies Moves
   ```

3. **Draw what's new** (skip this if she only moves). Anything she holds or that floats round her is
   a prop:
   - give `Pose` a field for it in `rig.ts` (`dandelion?: number`, how far through, 0 to 1);
   - in `props/charms.ts`, draw it in a painter. It's handed a `Scene`: where her hands, head and hips
     are, and `set` and `canvas.stamp` to put pixels down. Pictures are rows of palette letters:

     ```ts
     const DANDELION = ['.w.', 'wfw', '.w.']

     export function paintDandelion({ pose, canvas, hand }: Scene): void {
       const t = pose.dandelion ?? 0
       if (t <= 0 || t >= 1) return
       canvas.stamp(DANDELION, hand.x - 1, hand.y - 6)
     }
     ```

   - add the painter to `PROPS` in `props/index.ts`. Later in the list is drawn in front.

   If the move and the painter share times ("the seeds blow at 0.4"), put them in one timetable next
   to the painter (as `YOYO` or `SPIRIT` are) and import it into the move.

4. **New colours** (only if you need one): add a letter to `palette.ts`, with a class name, and give
   that class its colour in `components/character.css`. The letters still free are listed at the top
   of `palette.ts`.

5. **Check it.** `cd apps/desktop`, then `npx vitest run tests/sprite.test.ts tests/catalogue.test.ts`:
   the frames are the right size and colours, the move lasts exactly its `ms`, it's filed under its
   kind, and every painter is drawn. Then `npm run dev` from the top folder to watch. To see it
   sooner, give it `weight: 50` for a moment, and take that out again.

6. **Tell people.** Add it to the README's list of habits (and its count).

A **toy** or a **visitor** is a habit of kind `toy` or `visitor`, made the same way. Toys appear in a
sparkle and go in a twinkle: `toyKit` in `props/toys.ts` gives you `poof` and `shows` for that.

## Add a reaction or a held pose

- A **reaction** plays once, in answer to something: add it to `REACTIONS` and `REACTION_MS` in
  `shared/character.ts`, and its move (`once(…)`) to `REACTION_MOVES` in `moves/reactions.ts`. The
  main process plays it with `BubbleController.react()`.
- A **held pose** goes round for as long as something else says (a performance's): add it to
  `HELD_POSES`, and its move (`repeating(…)`) to `PERFORMANCE_MOVES` in `moves/performances.ts`.
  A pose whose name ends in `-left` or `-right` always faces that way.

## Add a performance

A performance is longer than a habit, and may move her about or draw outside her window.

1. In `main/bubble/wander.ts`, add it to `PERFORMANCE_LIST`: how likely it is when it can be done
   (`RARE` is a fifth as likely as a habit) and whether it moves her (if it does, it's left out while
   Settings → Stand still is on).
2. Write what does it, in `main/performances/`: something that returns a `Performance`, whose
   `at(t)` says where her box is and her pose at each moment (or `null` once it's over), and whose
   `end(finished)` tidies up. Give it `clicked(t)` if clicking her should do something.
3. In `main/index.ts`, plug it into `Performances`' `more`: `myThing: (standing) => …`.
4. Its poses are held poses (above).
5. If it draws over the screen, give it a window (below), and work out the timeline in `shared/`
   once, for the main process and the page to share, as `shared/battle.ts` and `shared/tricks.ts`
   do. Test the timeline on its own, as `tests/battle.test.ts` does.

## Add a window of effects

For something drawn over the screen that never takes the mouse (like her battle's monsters):

1. Name it in `PASSIVE_VIEWS` in `shared/views.ts`.
2. Write its page in `renderer/src/views/` (start from `BattleView`): `fitToWindow(canvas)` from
   `lib/overlayCanvas.ts` sizes a canvas to the window and tells you where the window is on the
   screen. Everything it needs comes in its address (`?plan=…&starts=…`).
3. Add it to `PAGES` in `renderer/src/main.tsx` (it won't build until you do).
4. Open it from the main process with `openOverlay('myView')(bounds, query)` in `index.ts`, and
   close it when you're done.

## Change how often things happen

- A habit: its `weight` in `HABIT_LIST` (1 if not given; the vision is 0.2).
- The rare performances together: `RARE` in `wander.ts`; one performance: its `weight`.
- Habits for certain times (late at night, Friday evenings): `TIMED` and `inSeason()` in
  `shared/character.ts`.
- How soon she starts doing things, and how far she wanders: `WANDER` in `wander.ts`.

## Change her colours

Her robe and hat are mixed from one variable, `--color-robe` in `character.css` (the company's
colour, or the one picked in Settings), so recolouring them redraws nothing. Every other colour is
one class per palette letter in `character.css`.
