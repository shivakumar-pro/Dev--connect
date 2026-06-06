import { useState, useEffect, useCallback } from 'react';
import { Trophy, Loader2, Crown, ChevronDown } from 'lucide-react';
import { LeaderboardAPI } from '../../services/api';
import { isLeaderboardKeyHidden } from '../../utils/hiddenGames';

interface Row { rank: number; username: string; wins: number; played: number; winRate: number }

// Frequently-played games shown as direct tabs…
const PRIMARY_GAMES = [
  { key: 'ALL', label: 'All Games' },
  { key: 'BOTTLE', label: 'Bottle Shuffle' },
  { key: 'PHASE10', label: 'Phase 10' },
  { key: 'DICE_PIG', label: 'Pig' },
].filter(g => !isLeaderboardKeyHidden(g.key));

// …everything else lives behind the "More" filter.
const MORE_GAMES = [
  { key: 'GUESS', label: 'Guess the Number' },
  { key: 'DICE_FARKLE', label: 'Farkle' },
  { key: 'DICE_LIARS_DICE', label: "Liar's Dice" },
  { key: 'DICE_SHIP_CAPTAIN_CREW', label: 'Ship Captain Crew' },
  { key: 'BLUFF', label: 'Bluff' },
  { key: 'SECRET_HINT', label: 'Secret Hint' },
  { key: 'MEMORY_GAME', label: 'Memory Game' },
  { key: 'PREDICT_ME', label: 'Predict Me' },
  { key: 'GUESS_FAVORITES', label: 'Guess Favorites' },
  { key: 'QUICK_QUIZ', label: 'Quick Quiz' },
  { key: 'THIS_OR_THAT', label: 'This or That' },
].filter(g => !isLeaderboardKeyHidden(g.key));

const medal = (rank: number) => (rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `#${rank}`);

export const Leaderboard = ({ currentUser }: { currentUser?: any }) => {
  const username = currentUser?.username || '';
  const [game, setGame] = useState('ALL');
  const [period, setPeriod] = useState<'WEEKLY' | 'ALL_TIME'>('WEEKLY');
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [moreOpen, setMoreOpen] = useState(false);

  const activeMore = MORE_GAMES.find(g => g.key === game);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await LeaderboardAPI.get(game, period, 50);
      setRows((res?.data ?? res ?? []) as Row[]);
    } catch { setRows([]); }
    finally { setLoading(false); }
  }, [game, period]);

  useEffect(() => { load(); }, [load]);

  const myRow = rows.find(r => r.username === username);

  return (
    <div className="flex flex-col h-full w-full bg-bg-primary">
      {/* Header */}
      <header className="h-16 sm:h-20 px-4 sm:px-8 border-b border-border-color flex items-center gap-3 shrink-0 glass z-10">
        <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-gradient-to-br from-yellow-500/20 to-amber-500/20 border border-yellow-500/20 flex items-center justify-center shrink-0">
          <Trophy className="w-5 h-5 sm:w-6 sm:h-6 text-yellow-500" />
        </div>
        <div className="min-w-0">
          <h2 className="font-bold text-base sm:text-xl leading-tight">Leaderboard</h2>
          <p className="text-xs sm:text-sm text-text-secondary truncate">Who's on top this {period === 'WEEKLY' ? 'week' : 'season'}</p>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-4 sm:px-8 py-5 pb-24 lg:pb-8">
        <div className="max-w-2xl mx-auto flex flex-col gap-5">

          {/* Period toggle */}
          <div className="flex items-center gap-2 self-center bg-bg-secondary border border-border-color rounded-full p-1">
            {(['WEEKLY', 'ALL_TIME'] as const).map(p => (
              <button key={p} onClick={() => setPeriod(p)}
                className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-colors ${period === p ? 'bg-accent-orange text-white' : 'text-text-secondary hover:text-text-primary'}`}>
                {p === 'WEEKLY' ? 'This Week' : 'All Time'}
              </button>
            ))}
          </div>

          {/* Game tabs — frequently played directly, the rest behind "More" */}
          <div className="flex items-center gap-2 flex-wrap justify-center">
            {PRIMARY_GAMES.map(g => (
              <button key={g.key} onClick={() => setGame(g.key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${game === g.key ? 'bg-accent-purple/15 text-accent-purple border-accent-purple/30' : 'text-text-secondary border-border-color hover:bg-hover-bg'}`}>
                {g.label}
              </button>
            ))}

            {/* More filter */}
            <div className="relative">
              <button onClick={() => setMoreOpen(o => !o)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors flex items-center gap-1 ${activeMore ? 'bg-accent-purple/15 text-accent-purple border-accent-purple/30' : 'text-text-secondary border-border-color hover:bg-hover-bg'}`}>
                {activeMore ? activeMore.label : 'More'}
                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${moreOpen ? 'rotate-180' : ''}`} />
              </button>
              {moreOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setMoreOpen(false)} />
                  <div className="absolute z-50 mt-1 left-1/2 -translate-x-1/2 w-48 max-h-64 overflow-y-auto bg-bg-secondary border border-border-color rounded-xl shadow-2xl py-1">
                    {MORE_GAMES.map(g => (
                      <button key={g.key} onClick={() => { setGame(g.key); setMoreOpen(false); }}
                        className={`w-full text-left px-3 py-2 text-xs transition-colors ${game === g.key ? 'text-accent-purple font-semibold bg-accent-purple/10' : 'text-text-secondary hover:bg-hover-bg'}`}>
                        {g.label}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Your rank pill */}
          {myRow && (
            <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-gradient-to-r from-accent-purple/10 to-accent-orange/10 border border-accent-purple/20">
              <span className="text-lg font-bold w-10 text-center">{medal(myRow.rank)}</span>
              <span className="flex-1 text-sm font-semibold text-text-primary">You</span>
              <span className="text-xs text-text-secondary">{myRow.wins} wins · {myRow.winRate}%</span>
            </div>
          )}

          {/* List */}
          {loading ? (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-text-muted">
              <Loader2 className="w-7 h-7 animate-spin text-accent-orange" />
              <span className="text-sm">Loading rankings…</span>
            </div>
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-center justify-center text-center py-16 px-6">
              <div className="w-16 h-16 rounded-2xl bg-hover-bg border border-border-color flex items-center justify-center mb-4">
                <Trophy className="w-8 h-8 text-text-muted" />
              </div>
              <h3 className="font-semibold text-text-primary mb-1">No games yet {period === 'WEEKLY' ? 'this week' : ''}</h3>
              <p className="text-sm text-text-secondary max-w-xs">Play a game to claim the top spot — be the first on the board!</p>
            </div>
          ) : (
            <div className="bg-bg-secondary border border-border-color rounded-xl overflow-hidden">
              {rows.map(r => {
                const mine = r.username === username;
                return (
                  <div key={r.username} className={`flex items-center gap-3 px-4 py-3 border-b border-border-color last:border-0 ${mine ? 'bg-accent-purple/5' : ''}`}>
                    <span className={`w-10 text-center font-bold ${r.rank <= 3 ? 'text-lg' : 'text-sm text-text-muted'}`}>{medal(r.rank)}</span>
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-accent-purple to-accent-orange flex items-center justify-center text-white text-xs font-bold shrink-0">
                      {r.username.charAt(0).toUpperCase()}
                    </div>
                    <span className="flex-1 text-sm font-medium text-text-primary truncate flex items-center gap-1.5">
                      {r.username}{mine && ' (you)'}
                      {r.rank === 1 && <Crown className="w-3.5 h-3.5 text-yellow-500" />}
                    </span>
                    <div className="text-right shrink-0">
                      <div className="text-sm font-bold text-text-primary">{r.wins}<span className="text-[11px] font-normal text-text-muted"> wins</span></div>
                      <div className="text-[11px] text-text-muted">{r.played} played · {r.winRate}%</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
