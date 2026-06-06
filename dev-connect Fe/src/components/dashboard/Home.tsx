import { useState, useEffect } from 'react';
import { Gamepad2, Trophy, Flame, Target, Crown, MessageCircle, Sparkles, ArrowRight, Brain, Dices } from 'lucide-react';
import { LeaderboardAPI } from '../../services/api';
import { getAvatarEmoji } from '../../utils/avatars';

interface Stats { totalPlayed: number; totalWins: number; winRate: number; currentStreak: number }
interface LbRow { rank: number; username: string; wins: number; winRate: number }

export const Home = ({ currentUser, onNavigate }: { currentUser?: any; onNavigate: (tab: string, child?: string) => void }) => {
  const username = currentUser?.username || '';
  const [stats, setStats] = useState<Stats | null>(null);
  const [top, setTop] = useState<LbRow[]>([]);

  useEffect(() => {
    if (!username) return;
    LeaderboardAPI.stats(username).then(res => setStats((res?.data ?? res) as Stats)).catch(() => {});
    LeaderboardAPI.get('ALL', 'WEEKLY', 5).then(res => setTop((res?.data ?? res ?? []) as LbRow[])).catch(() => {});
  }, [username]);

  const greeting = (() => {
    const h = new Date().getHours();
    return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
  })();

  const statCards = [
    { label: 'Games Played', value: stats?.totalPlayed ?? 0, icon: <Gamepad2 className="w-5 h-5" />, tint: 'from-accent-purple to-accent-hover' },
    { label: 'Wins', value: stats?.totalWins ?? 0, icon: <Trophy className="w-5 h-5" />, tint: 'from-yellow-500 to-amber-600' },
    { label: 'Win Rate', value: `${stats?.winRate ?? 0}%`, icon: <Target className="w-5 h-5" />, tint: 'from-emerald-500 to-teal-600' },
    { label: 'Win Streak', value: stats?.currentStreak ?? 0, icon: <Flame className="w-5 h-5" />, tint: 'from-orange-500 to-red-500' },
  ];

  const quickPlay = [
    { name: 'Bottle Shuffle', desc: 'Crack the hidden order', icon: <Brain className="w-5 h-5" />, tint: 'from-emerald-500 to-teal-600' },
    { name: 'Phase 10', desc: 'Race through 10 phases', icon: <Sparkles className="w-5 h-5" />, tint: 'from-fuchsia-500 to-purple-600' },
    { name: 'Dice Games', desc: 'Roll & push your luck', icon: <Dices className="w-5 h-5" />, tint: 'from-yellow-500 to-amber-600' },
  ];

  return (
    <div className="flex flex-col h-full w-full bg-bg-primary overflow-y-auto">
      <div className="max-w-4xl mx-auto w-full px-4 sm:px-8 py-6 sm:py-10 pb-24 lg:pb-10 flex flex-col gap-7">

        {/* Greeting */}
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-bg-tertiary border border-border-color flex items-center justify-center text-3xl shrink-0">
            {getAvatarEmoji(currentUser?.profileAvatar)}
          </div>
          <div className="min-w-0">
            <p className="text-xs sm:text-sm text-text-muted">{greeting},</p>
            <h1 className="text-2xl sm:text-3xl font-bold text-text-primary truncate">{username || 'Developer'} 👋</h1>
          </div>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {statCards.map(c => (
            <div key={c.label} className="bg-bg-secondary border border-border-color rounded-xl p-4 flex flex-col gap-2">
              <div className={`w-9 h-9 rounded-lg bg-gradient-to-br ${c.tint} flex items-center justify-center text-white`}>{c.icon}</div>
              <div className="text-2xl font-bold text-text-primary leading-none">{c.value}</div>
              <div className="text-[11px] text-text-muted uppercase tracking-wide">{c.label}</div>
            </div>
          ))}
        </div>

        {/* Quick play */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold text-text-primary flex items-center gap-2"><Gamepad2 className="w-4 h-4 text-accent-orange" /> Quick Play</h2>
            <button onClick={() => onNavigate('gameroom')} className="text-xs text-accent-orange font-semibold flex items-center gap-1 hover:gap-1.5 transition-all">
              All games <ArrowRight className="w-3 h-3" />
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {quickPlay.map(g => (
              <button key={g.name} onClick={() => onNavigate('gameroom')}
                className="group bg-bg-secondary border border-border-color rounded-xl p-4 flex items-center gap-3 text-left hover:border-border-hover hover:-translate-y-0.5 transition-all">
                <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${g.tint} flex items-center justify-center text-white shrink-0 group-hover:scale-110 transition-transform`}>{g.icon}</div>
                <div className="min-w-0">
                  <div className="font-semibold text-sm text-text-primary truncate">{g.name}</div>
                  <div className="text-[11px] text-text-muted truncate">{g.desc}</div>
                </div>
              </button>
            ))}
          </div>
        </section>

        {/* Weekly leaderboard snapshot */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold text-text-primary flex items-center gap-2"><Trophy className="w-4 h-4 text-yellow-500" /> Weekly Top Players</h2>
            <button onClick={() => onNavigate('leaderboard')} className="text-xs text-accent-orange font-semibold flex items-center gap-1 hover:gap-1.5 transition-all">
              Full board <ArrowRight className="w-3 h-3" />
            </button>
          </div>
          <div className="bg-bg-secondary border border-border-color rounded-xl overflow-hidden">
            {top.length === 0 ? (
              <div className="px-4 py-6 text-center text-sm text-text-muted">No games yet this week — play one to top the board!</div>
            ) : top.map(r => (
              <div key={r.username} className={`flex items-center gap-3 px-4 py-2.5 border-b border-border-color last:border-0 ${r.username === username ? 'bg-accent-purple/5' : ''}`}>
                <span className="w-8 text-center font-bold text-sm">{r.rank === 1 ? '🥇' : r.rank === 2 ? '🥈' : r.rank === 3 ? '🥉' : `#${r.rank}`}</span>
                <span className="flex-1 text-sm text-text-primary truncate flex items-center gap-1.5">{r.username}{r.username === username && ' (you)'}{r.rank === 1 && <Crown className="w-3.5 h-3.5 text-yellow-500" />}</span>
                <span className="text-xs text-text-muted">{r.wins} wins · {r.winRate}%</span>
              </div>
            ))}
          </div>
        </section>

        {/* Jump back to chat */}
        <button onClick={() => onNavigate('chat', 'global')}
          className="flex items-center gap-3 bg-bg-secondary border border-border-color rounded-xl p-4 hover:border-border-hover transition-colors text-left">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-accent-purple to-accent-hover flex items-center justify-center text-white shrink-0"><MessageCircle className="w-5 h-5" /></div>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-sm text-text-primary">Global Chat</div>
            <div className="text-[11px] text-text-muted">Jump into the developer room</div>
          </div>
          <ArrowRight className="w-4 h-4 text-text-muted shrink-0" />
        </button>

      </div>
    </div>
  );
};
