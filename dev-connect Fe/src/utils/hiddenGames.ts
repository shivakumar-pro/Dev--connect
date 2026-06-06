/**
 * Single source of truth for games we want to hide from the UI without
 * deleting them. Hidden games disappear from both the Game Room grid and the
 * Leaderboard's game filter. Flip a flag here to bring one back.
 */

// IDs used by GameRoom's card list (the `id` field on each GameCard).
export const HIDDEN_GAME_IDS: ReadonlySet<string> = new Set([
  'bluff',
  'secret_hint',
  'memory_game',
  'predict_me',
  'guess_favorites',
  'quick_quiz',
  // 'this_or_that',
  'dice_farkle',
  'dice_liars',
  'dice_scc',
]);

// Keys used by Leaderboard / backend stats. Mirror the IDs above so hiding
// stays consistent across the app.
export const HIDDEN_LEADERBOARD_KEYS: ReadonlySet<string> = new Set([
  'BLUFF',
  'SECRET_HINT',
  'MEMORY_GAME',
  'PREDICT_ME',
  'GUESS_FAVORITES',
  'QUICK_QUIZ',
  // 'THIS_OR_THAT',
  'DICE_FARKLE',
  'DICE_LIARS_DICE',
  'DICE_SHIP_CAPTAIN_CREW',
]);

export const isGameHidden = (id: string) => HIDDEN_GAME_IDS.has(id);
export const isLeaderboardKeyHidden = (key: string) => HIDDEN_LEADERBOARD_KEYS.has(key);
