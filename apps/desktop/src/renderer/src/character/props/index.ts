// Everything drawn round her (her toys, her spells' effects, visitors, sparkles and hearts), in
// the order the rig draws them once she's drawn: each over the ones before. To add one: give Pose
// a field for it (rig.ts), write its painter in the file here for its kind, and put it in this
// list (later in the list is in front).

import type { Paint } from './kit'
import { paintDizzy, paintDust, paintTrail } from './basics'
import { paintBubbles, paintButterfly, paintJuggle, paintSpell, paintWisp } from './charms'
import { paintConfetti, paintSneeze, paintZzz } from './everyday'
import {
  paintBloom,
  paintFallingStar,
  paintFlame,
  paintFrost,
  paintHatTrick,
  paintPotion,
  paintRain,
  paintRainbow,
  paintSigil,
  paintTome,
} from './magic'
import { paintCharge } from './performances'
import { paintHearts, paintScroll, paintSweat } from './reactions'
import { paintBall, paintDeck, paintPlane, paintSpinTop, paintYoyo } from './toys'
import { paintSpirit } from './visitors'

export const PROPS: readonly Paint[] = [
  paintButterfly,
  paintZzz,
  paintJuggle,
  paintYoyo,
  paintSpinTop,
  paintDeck,
  paintPlane,
  paintBall,
  paintCharge,
  paintSpirit,
  paintBubbles,
  paintWisp,
  paintSneeze,
  paintTrail,
  paintSpell,
  paintFlame,
  paintFrost,
  paintBloom,
  paintSigil,
  paintRainbow,
  paintHatTrick,
  paintFallingStar,
  paintRain,
  paintPotion,
  paintTome,
  paintDust,
  paintDizzy,
  paintScroll,
  paintSweat,
  paintHearts,
  paintConfetti,
]
