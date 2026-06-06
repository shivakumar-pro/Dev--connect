import { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, Copy, CheckCircle, Users, Crown, Play, Loader2, RotateCcw, Trophy,
  Skull, Lock, Eye, ChevronRight,
} from 'lucide-react';
import { Button } from '../common/Button';
import { ToxicAPI } from '../../services/api';
import { getAvatarEmoji } from '../../utils/avatars';
import { GameInviteButton } from './GameInviteButton';
import { HowToPlay } from './HowToPlay';

type Phase = 'lobby' | 'waiting' | 'playing' | 'gameover';

// ── Flavor lines that pop after every bite ──
const SAFE_LINES = [
  'Mmm, delicious!',
  'So far so good…',
  'That was close!',
  'Nailed it!',
  'Trust your gut.',
  'Safe… for now.',
  'Yummy!',
  'Lucky bite!',
  'Devoured!',
  'Tasty escape!',
  'Crunchy!',
  'Phew, no poison.',
  'One down, more to go.',
  'Easy peasy.',
  'Chef\'s kiss!',
  'No toxins detected.',
  'Stomach approved.',
];
const SURVIVED_LINES = [
  'You survived the meal!',
  'Last bite dodged — chef of champions!',
  'Stomach of steel!',
  'Untouchable!',
  'Clean plate, clean conscience!',
  'No poison shall pass!',
];
const POISON_LINES = [
  'TOXIC BITE!',
  'Game over for you!',
  'That tasted… weird.',
  'Poisoned!',
  'Bit the dust!',
  'Toxic!',
  'The hidden killer!',
  'Down you go!',
  'Bad luck, chef.',
  'Pure venom!',
  'Lights out!',
  'Bon appé-die!',
];
const pickLine = (arr: string[]) => arr[Math.floor(Math.random() * arr.length)];

const RULES = [
  'Each player gets a 3×3 food board (the same menu for both).',
  'Secretly pick ONE position on your opponent\'s board — that\'s the poison.',
  'Take turns eating from YOUR OWN board. +1 point per safe bite.',
  'Bite the poison and you\'re out for the round.',
  'Highest total across all rounds wins the match.',
];

const ROUND_OPTIONS = [1, 3, 5];

interface Props {
  currentUser: any;
  onBack: () => void;
  initialRoomId?: string;
}

// ════════════════════════════════════════════════════════════════════════════

export const ToxicBite = ({ currentUser, onBack, initialRoomId }: Props) => {
  const username = currentUser?.username || '';

  const [phase, setPhase] = useState<Phase>('lobby');
  const [roomId, setRoomId] = useState('');
  const [roomInput, setRoomInput] = useState('');
  const [rounds, setRounds] = useState<number>(3);
  const [state, setState] = useState<any>(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isActing, setIsActing] = useState(false);

  // Eating animation overlay
  const [biteOverlay, setBiteOverlay] = useState<
    | { kind: 'safe' | 'poison' | 'survived'; emoji: string; line: string; position: number }
    | null
  >(null);
  const [shake, setShake] = useState(false);
  const [winConfetti, setWinConfetti] = useState(false);
  const lastEatRef = useRef<{ user: string; pos: number } | null>(null);

  const showError = (msg: string) => { setError(msg); setTimeout(() => setError(''), 4000); };

  // ── Polling ──
  const refreshState = async (rid: string) => {
    try {
      const res = await ToxicAPI.getRoom(rid, username);
      const d = res.data || res;
      applyRemoteState(d);
    } catch (err: any) {
      showError(err?.response?.data?.message || 'Failed to get room');
    }
  };

  // Detect remote eats by other players so we can flash the overlay for them too.
  const applyRemoteState = (d: any) => {
    if (!d) return;
    setState((prev: any) => {
      // detect other-player bites since last render
      if (prev && d.players && prev.players) {
        for (const np of d.players) {
          if (np.username === username) continue;
          const op = prev.players.find((p: any) => p.username === np.username);
          if (!op) continue;
          const newEats: number[] = (np.eaten || []).filter((p: number) => !(op.eaten || []).includes(p));
          if (newEats.length > 0) {
            const pos = newEats[newEats.length - 1];
            if (lastEatRef.current?.user !== np.username || lastEatRef.current?.pos !== pos) {
              lastEatRef.current = { user: np.username, pos };
              const opponentSurvived = !!np.survived && !op.survived;
              const opponentDied = !opponentSurvived && !np.alive && op.alive;
              const emoji = d.board?.[pos - 1] || '🍽️';
              setBiteOverlay({
                kind: opponentSurvived ? 'survived' : opponentDied ? 'poison' : 'safe',
                emoji,
                line: opponentSurvived
                  ? `${np.username} survived the meal! +5`
                  : opponentDied
                    ? `${np.username} hit the poison!`
                    : `${np.username} ate ${emoji} safely`,
                position: pos,
              });
              setTimeout(() => setBiteOverlay(null), opponentSurvived ? 2400 : 1700);
            }
          }
        }
      }
      return d;
    });

    if (d.status === 'IN_PROGRESS') setPhase('playing');
    else if (d.status === 'FINISHED') {
      setPhase('gameover');
      if (d.winner === username) setWinConfetti(true);
    } else if (d.status === 'WAITING' && phase !== 'waiting' && phase === 'lobby') {
      setPhase('waiting');
    } else if (d.status === 'WAITING' && phase !== 'lobby') {
      setPhase('waiting');
    }
  };

  useEffect(() => {
    if (!roomId || phase === 'lobby' || phase === 'gameover') return;
    const interval = setInterval(() => refreshState(roomId), 1800);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, phase]);

  // ── Lobby actions ──
  const handleCreate = async () => {
    setIsCreating(true); setError('');
    try {
      const res = await ToxicAPI.createRoom({ hostUsername: username, rounds, maxPlayers: 2 });
      const d = res.data || res;
      setRoomId(d.roomId);
      setPhase('waiting');
      applyRemoteState(d);
    } catch (err: any) {
      showError(err?.response?.data?.message || 'Failed to create');
    } finally {
      setIsCreating(false);
    }
  };

  const handleJoin = async (rid?: string) => {
    const id = (rid || roomInput).trim();
    if (!id) return;
    setRoomId(id);
    try {
      const res = await ToxicAPI.join(id, username);
      const d = res.data || res;
      setPhase('waiting');
      applyRemoteState(d);
    } catch (err: any) {
      showError(err?.response?.data?.message || 'Failed to join');
    }
  };

  useEffect(() => {
    if (initialRoomId) handleJoin(initialRoomId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialRoomId]);

  const handleStart = async () => {
    try {
      const res = await ToxicAPI.start(roomId, username);
      applyRemoteState(res.data || res);
    } catch (err: any) {
      showError(err?.response?.data?.message || 'Failed to start');
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(roomId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // ── In-game actions ──
  const poisonAt = async (pos: number) => {
    if (isActing) return;
    setIsActing(true);
    try {
      const res = await ToxicAPI.action(roomId, { username, action: 'poison', position: pos });
      applyRemoteState(res.data || res);
    } catch (err: any) {
      showError(err?.response?.data?.message || 'Failed to place poison');
    } finally { setIsActing(false); }
  };

  const eatAt = async (pos: number) => {
    if (isActing) return;
    setIsActing(true);
    try {
      const res = await ToxicAPI.action(roomId, { username, action: 'eat', position: pos });
      const d = res.data || res;
      // Resolve outcome by inspecting my state in the response.
      const me = d.players?.find((p: any) => p.username === username);
      const ateThis = me?.eaten?.includes(pos);
      const died = me && !me.alive;
      const survived = !!me?.survived;
      const emoji = d.board?.[pos - 1] || '🍽️';
      lastEatRef.current = { user: username, pos };
      if (survived) {
        // Ate the 8th safely — the 9th is the poison, +5 bonus, round ends for me.
        setBiteOverlay({ kind: 'survived', emoji, line: pickLine(SURVIVED_LINES), position: pos });
        setTimeout(() => setBiteOverlay(null), 2400);
      } else if (ateThis && died) {
        setBiteOverlay({ kind: 'poison', emoji, line: pickLine(POISON_LINES), position: pos });
        setShake(true);
        setTimeout(() => setShake(false), 600);
        setTimeout(() => setBiteOverlay(null), 1700);
      } else {
        setBiteOverlay({ kind: 'safe', emoji, line: pickLine(SAFE_LINES), position: pos });
        setTimeout(() => setBiteOverlay(null), 1700);
      }
      applyRemoteState(d);
    } catch (err: any) {
      showError(err?.response?.data?.message || 'Failed to eat');
    } finally { setIsActing(false); }
  };

  const nextRound = async () => {
    try {
      const res = await ToxicAPI.nextRound(roomId, username);
      applyRemoteState(res.data || res);
    } catch (err: any) {
      showError(err?.response?.data?.message || 'Failed to advance');
    }
  };

  // ── Derived helpers ──
  const players = state?.players || [];
  const me = players.find((p: any) => p.username === username);
  const opponent = players.find((p: any) => p.username !== username);
  const board: string[] = state?.board || [];
  const hostName = state?.hostUsername || state?.host || (players.length > 0 ? players[0].username : '');
  const isHost = hostName === username;
  const currentPhase: 'POISONING' | 'EATING' | 'ROUND_OVER' = state?.phase;
  const isMyTurn = state?.currentPlayer === username;
  const myEaten: number[] = me?.eaten || [];
  const oppEaten: number[] = opponent?.eaten || [];
  const myPoisonPick: number | null = me?.poisonForOpponent ?? null;
  const oppPicked: boolean = !!opponent?.hasPickedPoison;
  const myPicked: boolean = !!me?.hasPickedPoison;
  const totalRounds = state?.totalRounds || 3;
  const currentRound = state?.currentRound || 0;

  const lastRoundReveal = useMemo(() => {
    const hist = state?.roundHistory;
    if (!Array.isArray(hist) || hist.length === 0) return null;
    return hist[hist.length - 1];
  }, [state?.roundHistory]);

  // ════════════════════════════════════════════════════════════════════════
  return (
    <div className={`flex flex-col h-full w-full bg-[#0B1120] relative overflow-hidden ${shake ? 'animate-[shake_0.5s_ease-in-out]' : ''}`}>

      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          20%, 60% { transform: translateX(-10px); }
          40%, 80% { transform: translateX(10px); }
        }
        @keyframes float-up {
          0% { transform: translateY(0) scale(1); opacity: 1; }
          100% { transform: translateY(-80px) scale(1.3); opacity: 0; }
        }
        @keyframes bite-zoom {
          0% { transform: scale(0.6); opacity: 0; }
          25% { transform: scale(1.6); opacity: 1; }
          70% { transform: scale(1.3); opacity: 1; }
          100% { transform: scale(2.2); opacity: 0; }
        }
        @keyframes poison-pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(239,68,68,0.5); }
          50% { box-shadow: 0 0 60px 20px rgba(239,68,68,0.4); }
        }
      `}</style>

      {/* Win confetti */}
      {winConfetti && (
        <div className="absolute inset-0 z-50 pointer-events-none overflow-hidden">
          {Array.from({ length: 60 }).map((_, i) => (
            <div
              key={i}
              className="absolute animate-bounce"
              style={{
                left: `${Math.random() * 100}%`,
                top: `-${Math.random() * 20}%`,
                fontSize: `${Math.random() * 20 + 14}px`,
                animationDelay: `${Math.random() * 2}s`,
                animationDuration: `${Math.random() * 2 + 1}s`,
              }}
            >
              {['🎉', '🏆', '⭐', '🎊', '✨', '☠️', '🍽️'][Math.floor(Math.random() * 7)]}
            </div>
          ))}
        </div>
      )}

      {/* Bite overlay — absolute (not fixed) so it centers inside the game area, not the whole viewport */}
      <AnimatePresence>
        {biteOverlay && (
          <motion.div
            className="absolute inset-0 z-50 flex items-center justify-center pointer-events-none p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              initial={{ scale: 0.4, rotate: -6 }}
              animate={{ scale: 1, rotate: 0 }}
              exit={{ scale: 1.4, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 220, damping: 18 }}
              className={`rounded-3xl px-7 py-6 sm:px-10 sm:py-8 w-[min(28rem,calc(100%-2rem))] text-center shadow-2xl border-2 ${
                biteOverlay.kind === 'poison'
                  ? 'bg-gradient-to-br from-red-950 via-red-900 to-black border-red-500/60'
                  : biteOverlay.kind === 'survived'
                    ? 'bg-gradient-to-br from-amber-900 via-yellow-800 to-emerald-900 border-yellow-400/60'
                    : 'bg-gradient-to-br from-emerald-900 via-emerald-800 to-slate-900 border-emerald-500/40'
              }`}
              style={biteOverlay.kind === 'poison' ? { animation: 'poison-pulse 0.6s ease-in-out infinite' } : {}}
            >
              <div className="text-7xl sm:text-8xl mb-3" style={{ animation: 'bite-zoom 1.4s ease-out' }}>
                {biteOverlay.kind === 'poison'
                  ? '☠️'
                  : biteOverlay.kind === 'survived'
                    ? '🏆'
                    : biteOverlay.emoji}
              </div>
              <div className={`text-2xl sm:text-3xl font-extrabold mb-1 tracking-tight ${
                biteOverlay.kind === 'poison'
                  ? 'text-red-300'
                  : biteOverlay.kind === 'survived'
                    ? 'text-yellow-300'
                    : 'text-emerald-300'
              }`}>
                {biteOverlay.line}
              </div>
              {biteOverlay.kind === 'survived' ? (
                <div className="text-sm text-yellow-200 font-bold mt-1">+5 BONUS POINTS</div>
              ) : (
                <div className="text-xs text-slate-400 font-mono">Position {biteOverlay.position}</div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <header className="h-14 sm:h-16 px-3 sm:px-6 border-b border-white/[0.06] flex items-center gap-2 sm:gap-3 shrink-0 bg-[#0F172A]/80 backdrop-blur-sm z-10">
        <button onClick={onBack} className="p-1.5 hover:bg-white/[0.04] rounded-xl text-slate-400">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <HowToPlay title="How to play · Toxic Bite" steps={RULES} />
        <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-emerald-600 via-lime-600 to-rose-600 flex items-center justify-center shrink-0 text-lg">
          ☠️
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="font-bold text-sm sm:text-base text-white truncate">Toxic Bite</h2>
          <p className="text-[10px] sm:text-xs text-slate-400 truncate">
            {phase === 'lobby' ? 'Hide the poison. Trust no food.'
              : phase === 'waiting' ? `${players.length} / 2 players`
              : phase === 'gameover' ? 'Match over'
              : currentPhase === 'POISONING' ? '🤫 Place your poison'
              : currentPhase === 'EATING'
                ? (isMyTurn ? '🟢 Your bite!' : `⏳ ${state?.currentPlayer}'s turn`)
                : '📋 Round reveal'}
          </p>
        </div>
        {currentRound > 0 && phase === 'playing' && (
          <span className="text-[10px] bg-white/[0.04] border border-white/[0.08] rounded-full px-2.5 py-1 font-mono text-slate-400">
            Round {currentRound}/{totalRounds}
          </span>
        )}
        {roomId && <span className="hidden sm:inline text-[10px] bg-white/[0.04] border border-white/[0.08] rounded-full px-2.5 py-1 font-mono text-slate-500">{roomId}</span>}
      </header>

      {error && (
        <div className="mx-3 sm:mx-6 mt-2 bg-red-500/10 border border-red-500/20 text-red-400 px-3 py-2 rounded-xl text-xs text-center animate-pulse">
          {error}
        </div>
      )}

      <div className="flex-1 overflow-y-auto flex items-start sm:items-center justify-center p-3 sm:p-6 pb-20 lg:pb-6">

        {/* ── LOBBY ── */}
        {phase === 'lobby' && (
          <div className="w-full max-w-sm flex flex-col gap-5">
            <div className="flex flex-col items-center gap-4">
              <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-emerald-600 via-lime-600 to-rose-600 flex items-center justify-center shadow-2xl text-5xl">
                ☠️
              </div>
              <h3 className="text-2xl font-extrabold text-white">Toxic Bite</h3>
              <p className="text-sm text-slate-400 text-center max-w-xs italic">
                Hide the poison. Trust no food.
              </p>
            </div>

            <div className="bg-[#131C2E] border border-white/[0.06] rounded-2xl p-4">
              <p className="text-[11px] uppercase font-bold text-slate-500 tracking-wider mb-3">Rounds</p>
              <div className="grid grid-cols-3 gap-2">
                {ROUND_OPTIONS.map((n) => (
                  <button
                    key={n}
                    onClick={() => setRounds(n)}
                    className={`h-12 rounded-xl font-bold transition-all ${
                      rounds === n
                        ? 'bg-gradient-to-br from-rose-500 to-red-600 text-white shadow-lg shadow-rose-500/30 scale-105'
                        : 'bg-white/[0.04] border border-white/[0.08] text-slate-300 hover:bg-white/[0.08]'
                    }`}
                  >
                    {n} {n === 1 ? 'Round' : 'Rounds'}
                  </button>
                ))}
              </div>
            </div>

            <Button
              variant="primary"
              size="lg"
              className="w-full bg-gradient-to-r from-emerald-600 via-lime-600 to-rose-600 border-0 rounded-2xl h-14 text-lg font-bold shadow-lg hover:scale-[1.02] transition-transform"
              onClick={handleCreate}
              isLoading={isCreating}
            >
              ☠️ Create Room
            </Button>

            <div className="flex items-center gap-4">
              <div className="flex-1 h-px bg-white/[0.06]" />
              <span className="text-slate-600 text-xs">OR JOIN</span>
              <div className="flex-1 h-px bg-white/[0.06]" />
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Enter Room ID…"
                value={roomInput}
                onChange={(e) => setRoomInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
                className="flex-1 h-12 bg-white/[0.04] border border-white/[0.08] rounded-xl pl-4 text-sm text-white focus:outline-none focus:border-white/20 placeholder:text-slate-600"
              />
              <Button
                variant="primary"
                className="rounded-xl h-12 px-6 bg-gradient-to-r from-accent-purple to-accent-hover border-0 font-bold"
                onClick={() => handleJoin()}
                disabled={!roomInput.trim()}
              >
                Join
              </Button>
            </div>
          </div>
        )}

        {/* ── WAITING ── */}
        {phase === 'waiting' && (
          <div className="w-full max-w-sm flex flex-col items-center gap-5">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-600 via-lime-600 to-rose-600 flex items-center justify-center shadow-xl text-3xl animate-pulse">
              ☠️
            </div>
            <h3 className="text-xl font-bold text-white">Toxic Bite</h3>
            <button
              onClick={handleCopy}
              className="flex items-center gap-2 bg-white/[0.04] border border-white/[0.08] rounded-xl px-5 py-3 hover:border-white/20 transition-all hover:scale-105"
            >
              <span className="font-mono font-bold text-sm text-white">{roomId}</span>
              {copied ? <CheckCircle className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4 text-slate-500" />}
            </button>

            <GameInviteButton currentUser={currentUser} kind="toxic" roomId={roomId} label="Toxic Bite" />

            <div className="w-full bg-[#131C2E] border border-white/[0.06] rounded-2xl overflow-hidden">
              <div className="px-4 py-3 border-b border-white/[0.06] flex items-center justify-between">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                  Players ({players.length})
                </span>
                <Users className="w-4 h-4 text-slate-600" />
              </div>
              {players.map((p: any) => (
                <div key={p.username} className="flex items-center gap-3 px-4 py-3.5 border-b border-white/[0.03] last:border-0">
                  <div className="w-10 h-10 rounded-full bg-white/[0.04] border border-white/[0.08] flex items-center justify-center text-xl">
                    {getAvatarEmoji(p.profileAvatar)}
                  </div>
                  <span className="font-semibold text-sm text-white flex-1">
                    {p.username}{p.username === username ? ' (you)' : ''}
                  </span>
                  {hostName === p.username && <Crown className="w-4 h-4 text-yellow-500" />}
                </div>
              ))}
            </div>

            {isHost ? (
              <Button
                variant="primary"
                size="lg"
                className="w-full bg-gradient-to-r from-emerald-600 via-lime-600 to-rose-600 border-0 rounded-2xl h-14 text-lg font-bold shadow-lg hover:scale-[1.02] transition-transform"
                onClick={handleStart}
                disabled={players.length < 2}
              >
                <Play className="w-6 h-6 mr-2" /> {players.length < 2 ? 'Need 2 players' : 'Start Game!'}
              </Button>
            ) : (
              <div className="flex items-center gap-2 text-slate-500 py-3">
                <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
                <span className="text-sm">Waiting for host to start…</span>
              </div>
            )}
          </div>
        )}

        {/* ── PLAYING ── */}
        {phase === 'playing' && state && (
          <div className="w-full max-w-2xl flex flex-col gap-4">

            {/* Scoreboard */}
            <div className="grid grid-cols-2 gap-3 sm:gap-4">
              {players.map((p: any) => {
                const isMe = p.username === username;
                const isCurrent = state.currentPlayer === p.username && currentPhase === 'EATING';
                return (
                  <div
                    key={p.username}
                    className={`relative bg-[#131C2E] border-2 rounded-2xl p-4 text-center transition-all duration-300 ${
                      isCurrent ? 'border-rose-500/50 shadow-lg shadow-rose-500/10 scale-[1.02]' : 'border-white/[0.06]'
                    } ${!p.alive ? 'opacity-50' : ''}`}
                  >
                    {isCurrent && <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-8 h-1 rounded-full bg-rose-500" />}
                    <div className="text-2xl mb-1">{getAvatarEmoji(p.profileAvatar)}</div>
                    <p className="text-xs font-semibold text-white truncate">{isMe ? 'You' : p.username}</p>
                    <div className="flex items-center justify-center gap-2 mt-1">
                      <p className={`text-2xl font-extrabold ${isCurrent ? 'text-rose-400' : 'text-slate-300'}`}>
                        {p.score ?? 0}
                      </p>
                      <span className="text-[10px] text-slate-500">total</span>
                    </div>
                    <div className="text-[11px] text-slate-500 mt-1">
                      this round: <span className="text-white font-bold">+{p.currentRoundScore ?? 0}</span>
                    </div>
                    {!p.alive && p.survived && (
                      <span className="inline-flex items-center gap-1 mt-1 text-[10px] text-yellow-300 font-bold bg-yellow-500/10 px-2 py-0.5 rounded-full">
                        🏆 SURVIVED +5
                      </span>
                    )}
                    {!p.alive && !p.survived && (
                      <span className="inline-flex items-center gap-1 mt-1 text-[10px] text-red-400 font-bold bg-red-500/10 px-2 py-0.5 rounded-full">
                        <Skull className="w-3 h-3" /> OUT
                      </span>
                    )}
                  </div>
                );
              })}
            </div>

            {/* ▒▒ POISONING PHASE ▒▒ */}
            {currentPhase === 'POISONING' && (
              <div className="bg-[#131C2E] border border-rose-500/20 rounded-2xl p-5">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs uppercase font-bold tracking-wider text-rose-400 flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5" />
                    {myPicked ? 'Poison locked in' : "Pick a spot on opponent's board"}
                  </p>
                  <p className="text-[10px] text-slate-500">
                    {oppPicked
                      ? <span className="text-emerald-400">opponent ready ✓</span>
                      : 'opponent thinking…'}
                  </p>
                </div>
                <p className="text-xs text-slate-400 mb-4 italic">
                  Whatever you pick here becomes the hidden poison your opponent must avoid when they eat.
                </p>

                <div className="grid grid-cols-3 gap-2 sm:gap-3 max-w-xs mx-auto">
                  {board.map((emoji, i) => {
                    const pos = i + 1;
                    const picked = myPoisonPick === pos;
                    return (
                      <button
                        key={i}
                        onClick={() => !myPicked && poisonAt(pos)}
                        disabled={myPicked || isActing}
                        className={`aspect-square rounded-2xl flex items-center justify-center text-3xl sm:text-4xl border-2 transition-all duration-200 ${
                          picked
                            ? 'bg-gradient-to-br from-rose-600/40 to-red-700/40 border-rose-400 scale-105 shadow-lg shadow-rose-500/40'
                            : myPicked
                              ? 'bg-white/[0.02] border-white/[0.06] opacity-50 cursor-not-allowed'
                              : 'bg-white/[0.04] border-white/[0.08] hover:border-rose-400/60 hover:scale-105 active:scale-95'
                        }`}
                      >
                        {picked ? '☠️' : emoji}
                      </button>
                    );
                  })}
                </div>

                {myPicked && !oppPicked && (
                  <p className="text-center text-xs text-slate-500 mt-4 flex items-center justify-center gap-2">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Waiting for opponent to lock their poison…
                  </p>
                )}
              </div>
            )}

            {/* ▒▒ EATING PHASE ▒▒ */}
            {currentPhase === 'EATING' && (
              <div className="bg-[#131C2E] border border-white/[0.06] rounded-2xl p-5">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs uppercase font-bold tracking-wider text-emerald-400">
                    {isMyTurn ? '🍽️ Your board · Choose a bite' : 'Your board'}
                  </p>
                  {opponent && (
                    <p className="text-[10px] text-slate-500 flex items-center gap-1">
                      <Eye className="w-3 h-3" /> {opponent.username} ate {oppEaten.length}
                    </p>
                  )}
                </div>
                <p className="text-xs text-slate-400 mb-4 italic">
                  Eat from your own board. +1 per safe bite. Hit the hidden poison and you're done.
                </p>

                <div className="grid grid-cols-3 gap-2 sm:gap-3 max-w-xs mx-auto">
                  {board.map((emoji, i) => {
                    const pos = i + 1;
                    const eaten = myEaten.includes(pos);
                    const canEat = isMyTurn && me?.alive && !eaten && !isActing;
                    return (
                      <button
                        key={i}
                        onClick={() => canEat && eatAt(pos)}
                        disabled={!canEat}
                        className={`relative aspect-square rounded-2xl flex items-center justify-center text-3xl sm:text-4xl border-2 transition-all duration-200 ${
                          eaten
                            ? 'bg-white/[0.02] border-white/[0.06] opacity-30'
                            : canEat
                              ? 'bg-white/[0.04] border-white/[0.08] hover:border-emerald-400/60 hover:scale-105 active:scale-95 cursor-pointer'
                              : 'bg-white/[0.04] border-white/[0.06] opacity-60 cursor-default'
                        }`}
                      >
                        <span className={eaten ? 'line-through opacity-40' : ''}>{emoji}</span>
                        <span className="absolute bottom-1 right-1.5 text-[9px] font-mono text-slate-600">
                          {pos}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {!me?.alive && (
                  <div className="mt-4 text-center text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl py-3 px-3">
                    💀 You're out for this round — waiting on {opponent?.username || 'opponent'}…
                  </div>
                )}
                {!isMyTurn && me?.alive && (
                  <div className="mt-4 flex items-center justify-center gap-3 py-3 text-slate-400 text-sm">
                    <div className="flex gap-1">
                      {[0, 150, 300].map(d => (
                        <div key={d} className="w-2 h-2 rounded-full bg-slate-500 animate-bounce" style={{ animationDelay: `${d}ms` }} />
                      ))}
                    </div>
                    Waiting for <strong className="text-white">{state.currentPlayer}</strong>…
                  </div>
                )}
              </div>
            )}

            {/* ▒▒ ROUND OVER ▒▒ */}
            {currentPhase === 'ROUND_OVER' && lastRoundReveal && (
              <div className="bg-[#131C2E] border border-emerald-500/20 rounded-2xl p-5">
                <div className="text-center mb-4">
                  <p className="text-xs uppercase font-bold tracking-wider text-emerald-400 mb-1">Round Reveal</p>
                  <h3 className="text-xl font-extrabold text-white">
                    {lastRoundReveal.roundWinner === username
                      ? '🏆 You took the round!'
                      : lastRoundReveal.roundWinner
                        ? `${lastRoundReveal.roundWinner} took the round`
                        : '🤝 Tied round'}
                  </h3>
                </div>

                {/* Per-player reveal */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                  {(lastRoundReveal.players || []).map((row: any) => {
                    const poisonPos: number | null = row.poisonOnMyBoard;
                    const eaten: number[] = row.eaten || [];
                    const isMine = row.username === username;
                    return (
                      <div key={row.username} className={`bg-[#0F172A] border rounded-xl p-3 ${row.survived ? 'border-yellow-400/40' : 'border-white/[0.06]'}`}>
                        <div className="flex items-center justify-between mb-2 gap-2">
                          <span className="text-xs font-bold text-white truncate">{isMine ? 'Your board' : `${row.username}'s board`}</span>
                          <span className="flex items-center gap-1.5 shrink-0">
                            {row.survived && (
                              <span className="text-[9px] font-bold text-yellow-300 bg-yellow-500/10 border border-yellow-500/30 px-1.5 py-0.5 rounded-full">🏆 +5</span>
                            )}
                            <span className="text-[10px] text-emerald-400 font-bold">+{row.scored}</span>
                          </span>
                        </div>
                        <div className="grid grid-cols-3 gap-1.5">
                          {(lastRoundReveal.board || []).map((emoji: string, i: number) => {
                            const pos = i + 1;
                            const isPoison = poisonPos === pos;
                            const wasEaten = eaten.includes(pos);
                            return (
                              <div
                                key={i}
                                className={`aspect-square rounded-lg flex items-center justify-center text-xl sm:text-2xl border ${
                                  isPoison
                                    ? 'bg-red-500/20 border-red-500/60'
                                    : wasEaten
                                      ? 'bg-emerald-500/10 border-emerald-500/30'
                                      : 'bg-white/[0.02] border-white/[0.06]'
                                }`}
                              >
                                {isPoison ? '☠️' : emoji}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {isHost ? (
                  <Button
                    variant="primary"
                    className="w-full rounded-2xl h-12 bg-gradient-to-r from-emerald-600 via-lime-600 to-rose-600 border-0 font-bold shadow-lg"
                    onClick={nextRound}
                  >
                    {currentRound >= totalRounds ? <>Finish Match <Trophy className="w-4 h-4 ml-2" /></> : <>Next Round <ChevronRight className="w-4 h-4 ml-1" /></>}
                  </Button>
                ) : (
                  <p className="text-center text-xs text-slate-500 flex items-center justify-center gap-2">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Waiting for host to continue…
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── GAME OVER ── */}
        {phase === 'gameover' && state && (
          <div className="w-full max-w-md flex flex-col items-center gap-6">
            <div className={`w-24 h-24 rounded-full flex items-center justify-center shadow-2xl text-5xl ${
              state.winner === username
                ? 'bg-gradient-to-br from-yellow-400 to-amber-600 animate-bounce'
                : state.winner
                  ? 'bg-gradient-to-br from-slate-600 to-slate-700'
                  : 'bg-gradient-to-br from-slate-500 to-slate-600'
            }`}>
              {state.winner === username ? '🏆' : state.winner ? '☠️' : '🤝'}
            </div>
            <div className="text-center">
              <h2 className="text-3xl font-extrabold text-white mb-1">
                {state.winner === username
                  ? 'You Survived!'
                  : state.winner
                    ? `${state.winner} wins!`
                    : 'Match Tied!'}
              </h2>
              {state.winner === username && (
                <p className="text-lg text-yellow-400">🎉 The chef of champions! 🎉</p>
              )}
            </div>

            {/* Round-by-round final scoreboard */}
            <div className="w-full bg-[#131C2E] border border-white/[0.06] rounded-2xl overflow-hidden">
              <div className="px-5 py-3 border-b border-white/[0.06]">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                  <Trophy className="w-3.5 h-3.5 text-yellow-500" /> Final Standings
                </span>
              </div>
              <div className="px-5 py-2 border-b border-white/[0.04] grid gap-2 text-[10px] uppercase font-bold text-slate-500" style={{ gridTemplateColumns: `1fr repeat(${totalRounds}, minmax(0, 1fr)) 1fr` }}>
                <span>Player</span>
                {Array.from({ length: totalRounds }).map((_, i) => <span key={i} className="text-center">R{i+1}</span>)}
                <span className="text-right">Total</span>
              </div>
              {[...players].sort((a: any, b: any) => (b.score ?? 0) - (a.score ?? 0)).map((p: any) => (
                <div
                  key={p.username}
                  className={`grid items-center gap-2 px-5 py-3 border-b border-white/[0.03] last:border-0 ${
                    p.username === state.winner ? 'bg-yellow-500/5' : p.username === username ? 'bg-accent-purple/5' : ''
                  }`}
                  style={{ gridTemplateColumns: `1fr repeat(${totalRounds}, minmax(0, 1fr)) 1fr` }}
                >
                  <span className="text-xs font-semibold text-white truncate">
                    {p.username === username ? 'You' : p.username}
                  </span>
                  {Array.from({ length: totalRounds }).map((_, i) => (
                    <span key={i} className="text-center text-xs text-slate-400">
                      {(p.roundScores && p.roundScores[i] != null) ? p.roundScores[i] : '—'}
                    </span>
                  ))}
                  <span className="text-right text-base font-extrabold text-yellow-400">{p.score ?? 0}</span>
                </div>
              ))}
            </div>

            <div className="flex gap-3 w-full">
              <Button
                variant="outline"
                className="flex-1 rounded-2xl h-12 border-white/10 text-white font-bold"
                onClick={() => { setWinConfetti(false); onBack(); }}
              >
                Leave
              </Button>
              <Button
                variant="primary"
                className="flex-1 rounded-2xl h-12 bg-gradient-to-r from-emerald-600 via-lime-600 to-rose-600 border-0 font-bold shadow-lg"
                onClick={() => {
                  setWinConfetti(false);
                  setPhase('lobby');
                  setRoomId('');
                  setState(null);
                }}
              >
                <RotateCcw className="w-4 h-4 mr-2" /> Play Again
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
