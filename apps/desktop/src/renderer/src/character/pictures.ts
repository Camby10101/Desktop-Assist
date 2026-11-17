// Hand-drawn pictures of the character, as rows of palette letters (see PALETTE in sprite.ts;
// `.` is see-through), placed on the 96-pixel grid at (x, y).

/** A picture and where its top-left pixel goes on the grid. */
export interface Picture {
  x: number
  y: number
  rows: readonly string[]
}

/**
 * Her seen diagonally, turned to face right, standing: one flat drawing (no layers), so her hat,
 * ears, hair, face, robe and boots each sit exactly in front of or behind the others. Her
 * right side is toward us: her ear and the back of her head on the left, her near eye larger,
 * her far cheek (with a small upturned nose) the right-hand edge of her face, her long hair down
 * her back, her near leg in front. Her clothes carry the same patterns as the rig draws from
 * the front and side on (the hat's buckle, moon, stars and stitching; the robe's gold border,
 * stars, buttons and sash buckle; the boots' cuffs, laces and buckled straps), placed by hand to
 * suit the turn. Her near arm isn't in it: the rig draws it on top, since
 * it moves (waving, sipping, reading, casting). Her face is drawn with open eyes and a small
 * mouth; DIAGONAL_EYES and DIAGONAL_MOUTH say where other expressions go.
 */
export const DIAGONAL: Picture = {
  x: 33,
  y: 4,
  rows: [
    '...................q...........',
    '................qqqNq..........',
    '...............qgNNNq..........',
    '..............qggNNq...........',
    '.............qggkNNq...........',
    '............qgYYnNNq...........',
    '...........qgYnnNNNq...........',
    '...........qgYnnNNNq...........',
    '..........qggnYYnYNNq..........',
    '..........qknnnnnNNNq..........',
    '.........qggnnnnYYYNNq.........',
    '....qqqqqqFFFFFFYGYFFqqqqqq....',
    '..qqgggggfffffffYYYfffNNNNNqqq.',
    '.qgggnnnnnnnnnnnnnnnnNNNNNNNNNq',
    '.qNFNFNFNnnnnnnnnnnNNNNFNFNFNNq',
    '..qqNNNNNNNNNNNNNNNNNNNNNNNqqq.',
    '..K.qqqqqqqNNNNNNNNNNqqqqqq....',
    '.KzKKlODhDDqqqqqqqqqqDhDDO.....',
    '.KzsSKKDDhDDhhDDhhDhDDDDDO.....',
    '..KsssSKDODDDhDDDhDDDDDODO.....',
    '...KssSSKODDOODDOODDODDODO.....',
    '...OOOSSKOODOODDOODDOODOO......',
    '...OlDOSKKeOssOOssOOSODO.......',
    '..OllDDOKseeeeeesseeeeO........',
    '..OlhDDOOssseiiwssiiwSK........',
    '..OlDDDOOsssiIIissiIiSK........',
    '..OlhDDOOsssIjjIssIjjSS........',
    '..OlDDDOOssssjjsssjjSSSK.......',
    '..OlhDDOOSssccsssssScSK........',
    '..OlhhDOOKSssssssmmSSSK........',
    '...ODhDDODKKsssSSSSSSK.........',
    '...OlDDDODDDKssSSSSKKO.........',
    '...OlDDDODDqKzsSSKKDDO.........',
    '...OlhDDODqvKzSSSKvqqO.........',
    '...OlhhDOqvvKSSSSKffAq.........',
    '...OlDhDDOvaAKSSKafaAAq........',
    '...OllDDDOaaAAKKaffaAAAq.......',
    '...OllhDDOaaaaafafaAAAAq.......',
    '...OllDDDOaaaaaafGaAAAAq.......',
    '...OllhDDOaaaaaaGGGAAAAq.......',
    '...OlhhDDOaaaaaaaGaAAAAq.......',
    '...OlhDDDOaaaaaaaaaAAAAq.......',
    '...OlhlDDOaaaaaaaaaAAAAq.......',
    '...OlDhDDOaaaaaaaYaAAAAq.......',
    '...OlDhDDOaaaaaaaaaAAAAq.......',
    '...OlhDhDOaaaaaaaaaAAAAq.......',
    '...OlhDhDOaaaaaaaYaAAAAq.......',
    '...OlDhDDOaaaaaaaaaAAAAq.......',
    '...OlDhDDOaaaaaaaaaAAAAq.......',
    '...OlhDhDOaaaaaaaYaAAAAqq......',
    '...OlhDhDOaaaaaaaaaAAAAqq......',
    '...ODDDDDOaaaaaaaaaAAAAqq......',
    '...ODDODOAAAAAAAYYYAAAAqq......',
    '...ODO.OqqqqqqqqYkYqqqAAq......',
    '....O.qvaaaaaaaaafAAAAAAqq.....',
    '......qvaaaaaaaaafAAAAAAqq.....',
    '.....qvvaaaaaaaaafAAAAAAqq.....',
    '.....qvaaafvAaaaafAAAfAAqq.....',
    '.....qvaaaavAaaaafAAAAAAq......',
    '.....qvaaaavAaaaafaAAAAAAq.....',
    '.....qvaaaavAaaaafaAAAAAAq.....',
    '.....qvaaaavAaaaafaAAAAAAq.....',
    '.....qvafaavAafaafaAfAAAAq.....',
    '....qvvaaavAaaaaafaAAAAAAq.....',
    '....qvaaaavAaaaaafaAAAAAAq.....',
    '....qvaaaavAaaaaafaAAAAAAAq....',
    '....qvaaaafAaaaaafaAAfAAAAq....',
    '....qvaaaavAaaaaafaAAAAAAAq....',
    '....qvaaaavAaaaaafaAAAAAAAq....',
    '....qvkkkkkkkkkkkfkkkkkkkAq....',
    '...qvvaaaaaaaaaaafaAAAAAAAq....',
    '...qvaaaaaaaaaaaafaaAAAAAAAq...',
    '...qvaaaYaaaaaYaafaaYAAAAAAq...',
    '...qvaaYaYakaYaYafaYAYAkAAAq...',
    '...qvaaaYaaaaaYaafaaYAAAAAAq...',
    '...qAAAAAAAAAAAAAfAAAAAAAAAq...',
    '...qfffffffffffffffffffffffq...',
    '....qqqqqqqqqqqqqqqqqqqqqqq....',
    '.........uoooQQuooQQu..........',
    '.........uoyyyQuyyyQu..........',
    '.........uyyyyyuyyyyu..........',
    '.........uBBBBBuBBBBu..........',
    '.........uybbBBubbBBu..........',
    '.........uyybyBuybyBu..........',
    '.........uybyBBubyBBu..........',
    '.........uybbBBubbBBu..........',
    '.........uyybyBuybyBu..........',
    '.........uybbBBubbBBuu.........',
    '.........uBYBBBBuuBBYBu........',
    '.........uBBBBBBBBuBBBBu.......',
    '...xxxxxxuBBBBBBBBuBBBBuxxx....',
    'xxxxxxxxxxuuuuuuuuuuuuuxxxxxxx.',
  ],
}

/** Where the eyes are in DIAGONAL (grid pixels): near eye 5 × 5, far eye 4 × 5. */
export const DIAGONAL_EYES = { near: { x: 44, y: 27 }, far: { x: 51, y: 27 } }
/** Where the mouth is in DIAGONAL: two pixels wide, below the far eye. */
export const DIAGONAL_MOUTH = { x: 50, y: 33 }

/**
 * Her face side on, facing right, drawn by hand in the usual anime profile: a forehead under her
 * fringe, a small nose a pixel out, a little notch at her lips, a soft round chin, then
 * her jaw running back up to her ear, her neck in its shadow below it. It is placed relative to the
 * middle of her head (x and y here are offsets from it); her hair, ear and hat are drawn over it,
 * and her eyes, blush and mouth on it.
 */
export const SIDE_FACE: Picture = {
  x: -5,
  y: -3,
  rows: [
    '...ssssssssssK..',
    '...ssssssssssK..',
    '...ssssssssssK..',
    '...ssssssssssK..',
    '...ssssssssssK..',
    '...sssssssssssK.',
    '.KssssssssssssK.',
    'SKssssssssssSK..',
    'SSKssssssssssK..',
    'SSSKssssssssK...',
    'SSSSKKsssssSK...',
    'SSSSSSKKKKK.....',
  ],
}
