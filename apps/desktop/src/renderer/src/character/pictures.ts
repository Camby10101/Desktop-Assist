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
 * ears, hair, face, braid, robe and boots each sit exactly in front of or behind the others. Her
 * right side is toward us: her ear and the back of her head on the left, her near eye larger,
 * her far cheek (with a small upturned nose) the right-hand edge of her face, her braid over her
 * near shoulder, her near leg in front. Her clothes carry the same patterns as the rig draws from
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
    '...........qgYnnnnNq...........',
    '...........qgYnnnnNq...........',
    '..........qggnYYnYnNq..........',
    '..........qknnnnnnnNq..........',
    '.........qggnnnnYYYnNq.........',
    '....qqqqqqFFFFFFYGYFFqqqqqq....',
    '..qqgggggfffffffYYYfffgggggqqq.',
    '.qgggnnnnnnnnnnnnnnnnnnnnNNNNNq',
    '.qNFNFNFNnnnnnnnnnnNNNNFNFNFNNq',
    '..qqNNNNNNNNNNNNNNNNNNNNNNNqqq.',
    '..K.qqqqqqqNNNNNNNNNNqqqqqq....',
    '.KzKKlODhhhqqqqqqqqqqDhDDO.....',
    '.KzszKKDDhDDhhDDhhDhhDDDDO.....',
    '..KsssSKDODDDhDDDhDDhDDODO.....',
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
    '...ODhDDOhKKsssSSSSSSK.........',
    '...OlDDDOhhhKssSSSSKKO.........',
    '...OlDDDOhhqKzsSSKKDDO.........',
    '...OlhDDOhqvKzSSSKvqqO.........',
    '...OOhhDOqvvKSSSSKffvq.........',
    '...OODhDDOvaaKSSKafaaAq........',
    '...OOlDDDOaaaaKKaffaaAAq.......',
    '...OOlhDDOaaaaafafaaaAAq.......',
    '...OOlDDDOaaaaaafGaaaAAq.......',
    '...OOlhDDOaaaaaaGGGaaAAq.......',
    '...OlOhDDOaaaaaaaGaaaAAq.......',
    '...OlODDDOaaaaaaaaaaaAAq.......',
    '...OlOlDDOaaaaaaaaaaaAAq.......',
    '...OlOlDDOaaaaaaaYaaaAAq.......',
    '...OlODDDOaaaaaaaaaaaAAq.......',
    '...OlOlDDOaaaaaaaaaaaAAq.......',
    '....OOavvOaaaaaaaYaaaAAq.......',
    '....OODDDOaaaaaaaaaaaAAq.......',
    '....OOlDDOaaaaaaaaaaaAAq.......',
    '.....ODDDOaaaaaaaYaaaAAqq......',
    '.....ODDDOaaaaaaaaaaaAAqq......',
    '.....ODDDOaaaaaaaaaaaaAqq......',
    '......ODOAAAAAAAYYYAAAAqq......',
    '......qOqqqqqqqqYkYqqqAAq......',
    '......qvaaaaaaaaafaaaaAAqq.....',
    '......qvaaaaaaaaafaaaaAAqq.....',
    '.....qvvaaaaaaaaafaaaaAAqq.....',
    '.....qvaaafaaaaaafaaafaAqq.....',
    '.....qvaaaaaaaaaafaaaaaAq......',
    '.....qvaaaaaaaaaafaaaaaAAq.....',
    '.....qvaaaaaaaaaafaaaaaAAq.....',
    '.....qvaaaaaaaaaafaaaaaAAq.....',
    '.....qvafaaaaafaafaafaaAAq.....',
    '....qvvaaaaaaaaaafaaaaaaAq.....',
    '....qvaaaaaaaaaaafaaaaaaAq.....',
    '....qvaaaaaaaaaaafaaaaaaAAq....',
    '....qvaaaafaaaaaafaaafaaAAq....',
    '....qvaaaaaaaaaaafaaaaaaAAq....',
    '....qvaaaaaaaaaaafaaaaaaAAq....',
    '....qvkkkkkkkkkkkfkkkkkkkAq....',
    '...qvvaaaaaaaaaaafaaaaaaaAq....',
    '...qvaaaaaaaaaaaafaaaaaaaAAq...',
    '...qvaaaYaaaaaYaafaaYaaaaAAq...',
    '...qvaaYaYakaYaYafaYaYakaAAq...',
    '...qvaaaYaaaaaYaafaaYaaaaAAq...',
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
    '.........uybbbbubbbbuu.........',
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
 * fringe, a dip at the eye, a small pointed nose, a little notch at her lips, a soft chin, then
 * her jaw running back under her side lock, her neck in its shadow. It is placed relative to the
 * middle of her head (x and y here are offsets from it); her hair, ear and hat are drawn over it,
 * and her eyes, blush and mouth on it.
 */
export const SIDE_FACE: Picture = {
  x: -2,
  y: -3,
  rows: [
    'ssssssssssK..',
    'ssssssssssK..',
    'ssssssssssK..',
    'ssssssssssK..',
    'ssssssssssK..',
    'sssssssssssK.',
    'ssssssssssssK',
    'sssssssssSKK.',
    'ssssssssssK..',
    'sssssssssK...',
    'SSKssssssK...',
    'SSSKKsssSK...',
    'SSSSSKKKK....',
  ],
}
