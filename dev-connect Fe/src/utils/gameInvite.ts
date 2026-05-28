// Game-room invites are sent as ordinary private chat messages whose `content`
// is a JSON marker. No backend change is needed — the message travels through
// the normal private-message pipeline and the recipient parses it back.

export type GameInviteKind = 'guess' | 'dice' | 'party';
export type DiceType = 'PIG' | 'FARKLE' | 'LIARS_DICE' | 'SHIP_CAPTAIN_CREW';

export interface GameInvitePayload {
  __gameInvite: true;
  v: 1;
  kind: GameInviteKind;
  roomId: string;
  label: string;        // human-readable game name, e.g. "Pig"
  invitedBy: string;    // sender username
  diceType?: DiceType;  // when kind === 'dice'
  partyKey?: string;    // when kind === 'party'
}

export const encodeGameInvite = (p: Omit<GameInvitePayload, '__gameInvite' | 'v'>): string =>
  JSON.stringify({ __gameInvite: true, v: 1, ...p });

export const parseGameInvite = (content: unknown): GameInvitePayload | null => {
  if (typeof content !== 'string') return null;
  const s = content.trim();
  if (!s.startsWith('{') || !s.includes('__gameInvite')) return null;
  try {
    const obj = JSON.parse(s);
    if (obj && obj.__gameInvite === true && typeof obj.roomId === 'string' && obj.roomId) {
      return obj as GameInvitePayload;
    }
  } catch {
    /* not an invite */
  }
  return null;
};
