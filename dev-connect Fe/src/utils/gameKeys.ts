/**
 * Single source of truth mapping backend leaderboard `gameKey` strings to:
 *  - a friendly label
 *  - a short description (for Home page tiles)
 *  - the GameRoom card ID, so we can deep-link straight into the game
 *  - the gradient tint used in tiles
 *
 * Keep keys in sync with `LeaderboardService.record(gameKey, ...)` calls on the
 * backend.
 */
export interface GameKeyInfo {
  key: string;
  label: string;
  desc: string;
  gameRoomId: string;
  tint: string;
}

const REGISTRY: Record<string, GameKeyInfo> = {
  BOTTLE:                  { key: 'BOTTLE',                  label: 'Bottle Shuffle',   desc: 'Crack the hidden order',         gameRoomId: 'bottle_shuffle', tint: 'from-emerald-500 to-teal-600' },
  PHASE10:                 { key: 'PHASE10',                 label: 'Phase 10',         desc: 'Race through 10 phases',         gameRoomId: 'phase10',        tint: 'from-fuchsia-500 to-purple-600' },
  CHOWKA:                  { key: 'CHOWKA',                  label: 'Chowka Bara',      desc: 'Race your pieces home',          gameRoomId: 'chowka_bara',    tint: 'from-orange-500 to-rose-600' },
  TOXIC:                   { key: 'TOXIC',                   label: 'Toxic Bite',       desc: 'Hide the poison, trust no food', gameRoomId: 'toxic_bite',     tint: 'from-emerald-600 to-rose-600' },
  GUESS:                   { key: 'GUESS',                   label: 'Guess the Number', desc: 'Pick, guess, win',               gameRoomId: 'guess_1v1',      tint: 'from-indigo-500 to-purple-500' },
  DICE_PIG:                { key: 'DICE_PIG',                label: 'Pig',              desc: 'Roll or hold!',                  gameRoomId: 'dice_pig',       tint: 'from-yellow-500 to-amber-600' },
  DICE_FARKLE:             { key: 'DICE_FARKLE',             label: 'Farkle',           desc: 'Push your luck, then bank',      gameRoomId: 'dice_farkle',    tint: 'from-orange-500 to-red-500' },
  DICE_LIARS_DICE:         { key: 'DICE_LIARS_DICE',         label: "Liar's Dice",      desc: 'Bluff to win',                   gameRoomId: 'dice_liars',     tint: 'from-red-500 to-rose-600' },
  DICE_SHIP_CAPTAIN_CREW:  { key: 'DICE_SHIP_CAPTAIN_CREW',  label: 'Ship Captain Crew',desc: 'Lock 6-5-4, then cargo',         gameRoomId: 'dice_scc',       tint: 'from-blue-500 to-indigo-600' },
  THIS_OR_THAT:            { key: 'THIS_OR_THAT',            label: 'This or That',     desc: 'Pick a side, predict majority',  gameRoomId: 'this_or_that',   tint: 'from-amber-500 to-orange-500' },
  BLUFF:                   { key: 'BLUFF',                   label: 'Bluff',            desc: 'Find the imposter',              gameRoomId: 'bluff',          tint: 'from-red-500 to-rose-600' },
  SECRET_HINT:             { key: 'SECRET_HINT',             label: 'Secret Hint',      desc: 'Hint & guess',                   gameRoomId: 'secret_hint',    tint: 'from-teal-500 to-cyan-600' },
  MEMORY_GAME:             { key: 'MEMORY_GAME',             label: 'Memory Game',      desc: 'Remember it all',                gameRoomId: 'memory_game',    tint: 'from-violet-500 to-purple-600' },
  PREDICT_ME:              { key: 'PREDICT_ME',              label: 'Predict Me',       desc: 'Guess what friends said',        gameRoomId: 'predict_me',     tint: 'from-cyan-500 to-blue-500' },
  GUESS_FAVORITES:         { key: 'GUESS_FAVORITES',         label: 'Guess Favorites',  desc: 'Know your friends',              gameRoomId: 'guess_favorites',tint: 'from-pink-500 to-rose-500' },
  QUICK_QUIZ:              { key: 'QUICK_QUIZ',              label: 'Quick Quiz',       desc: 'Fastest answer wins',            gameRoomId: 'quick_quiz',     tint: 'from-green-500 to-emerald-500' },
};

export const getGameKeyInfo = (key: string): GameKeyInfo | undefined => REGISTRY[key];
