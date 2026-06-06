import { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Copy, CheckCircle, Users, Crown, Play, Loader2, RotateCcw, Trophy } from 'lucide-react';
import { Button } from '../common/Button';
import { DiceAPI } from '../../services/api';
import { getAvatarEmoji } from '../../utils/avatars';
import { GameInviteButton } from './GameInviteButton';
import { HowToPlay } from './HowToPlay';
import { Dice3D, DICE_ROLL_MS, DICE_STAGGER } from './Dice3D';

type Phase = 'lobby' | 'waiting' | 'playing' | 'gameover';
type DiceGameType = 'PIG' | 'FARKLE' | 'LIARS_DICE' | 'SHIP_CAPTAIN_CREW';

const DICE_RULES: Record<DiceGameType, string[]> = {
  PIG: [
    'On your turn, roll the die as many times as you like.',
    'Each roll adds to your running turn total.',
    'Roll a 1 and you lose the entire turn total!',
    '"Hold" to bank your points. First to the target score wins.',
  ],
  FARKLE: [
    'Roll 6 dice and set aside scoring dice (1s, 5s, triples…).',
    'Keep rolling the rest to build your turn score.',
    'Roll no scoring dice and you "Farkle" — lose the turn’s points.',
    'Bank anytime. First to the target score wins.',
  ],
  LIARS_DICE: [
    'Everyone rolls their dice hidden under a cup.',
    'Take turns raising the bid (quantity + face across all dice).',
    'Think a bid is too high? Call "Liar!".',
    'Wrong guesser loses a die. Last player with dice wins.',
  ],
  SHIP_CAPTAIN_CREW: [
    'Roll to get a 6 (ship), 5 (captain) and 4 (crew) — in that order.',
    'Once all three are locked, your last two dice are your cargo.',
    'You get up to 3 rolls per turn.',
    'Highest cargo score wins the round.',
  ],
};

const DICE_FACES = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];

const GAME_INFO: Record<DiceGameType, { name: string; desc: string; color: string; target: number; emoji: string }> = {
  PIG:               { name: 'Pig',                desc: 'Roll or hold — but roll a 1 and lose it all!',        color: 'from-yellow-500 to-amber-600',  target: 100,   emoji: '🐷' },
  FARKLE:            { name: 'Farkle',             desc: 'Keep scoring dice, push your luck, or bank it!',     color: 'from-orange-500 to-red-500',    target: 10000, emoji: '🔥' },
  LIARS_DICE:        { name: "Liar's Dice",        desc: 'Bluff your bids — call the liar!',                   color: 'from-red-500 to-rose-600',      target: 0,     emoji: '🕵️' },
  SHIP_CAPTAIN_CREW: { name: 'Ship Captain Crew',  desc: 'Lock 6-5-4, then score your cargo!',                 color: 'from-blue-500 to-indigo-600',   target: 0,     emoji: '⛵' },
};

interface DiceGameProps { currentUser: any; onBack: () => void; gameType: DiceGameType; initialRoomId?: string }

export const DiceGame = ({ currentUser, onBack, gameType, initialRoomId }: DiceGameProps) => {
  const username = currentUser?.username || '';
  const info = GAME_INFO[gameType];

  const [phase, setPhase] = useState<Phase>('lobby');
  const [roomId, setRoomId] = useState('');
  const [roomInput, setRoomInput] = useState('');
  const [state, setState] = useState<any>(null);
  const [, setResult] = useState<any>(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isActing, setIsActing] = useState(false);
  const [selectedIndices, setSelectedIndices] = useState<number[]>([]);
  const [bidQty, setBidQty] = useState(1);
  const [bidFace, setBidFace] = useState(2);
  const [eventLog, setEventLog] = useState<string[]>([]);

  // Animation states
  const [rolling, setRolling] = useState(false);
  const rollingRef = useRef(false);          // keeps the poll loop from clobbering a live throw
  const [rollId, setRollId] = useState(0);   // bump to replay the 3D throw
  const [pendingDice, setPendingDice] = useState<number[] | null>(null); // faces to land on this throw
  const [bustFlash, setBustFlash] = useState(false);
  const [scorePopup, setScorePopup] = useState<{ text: string; color: string } | null>(null);
  const [winConfetti, setWinConfetti] = useState(false);

  const showError = (msg: string) => { setError(msg); setTimeout(() => setError(''), 4000); };

  const showScorePopup = (text: string, color = 'text-green-400') => {
    setScorePopup({ text, color });
    setTimeout(() => setScorePopup(null), 2000);
  };

  const refreshState = async (rid: string) => {
    try {
      const res = await DiceAPI.getRoom(rid, username);
      const d = res.data || res;
      setState(d);
      if (d.status === 'PLAYING' || d.status === 'IN_PROGRESS') setPhase('playing');
      else if (d.status === 'FINISHED' || d.status === 'ENDED') {
        setPhase('gameover');
        if (d.winner === username) setWinConfetti(true);
      }
      else if (d.status === 'WAITING' && phase === 'lobby') setPhase('waiting');
      if (d.eventLog) setEventLog(d.eventLog.slice(-10));
    } catch (err: any) { showError(err?.response?.data?.message || 'Failed to get room'); }
  };

  useEffect(() => {
    if (!roomId || phase === 'lobby' || phase === 'gameover') return;
    const interval = setInterval(() => { if (!rollingRef.current) refreshState(roomId); }, 2000);
    return () => clearInterval(interval);
  }, [roomId, phase]);

  const handleCreate = async () => {
    setIsCreating(true); setError('');
    try {
      const res = await DiceAPI.createRoom({ gameType, hostUsername: username, targetScore: info.target || undefined, maxPlayers: 4 });
      const d = res.data || res;
      setRoomId(d.roomId || d.id);
      setPhase('waiting');
      await refreshState(d.roomId || d.id);
    } catch (err: any) { showError(err?.response?.data?.message || 'Failed to create'); }
    finally { setIsCreating(false); }
  };

  const handleJoin = async (rid?: string) => {
    const id = (rid || roomInput).trim();
    if (!id) return;
    setRoomId(id);
    try {
      await DiceAPI.join(id, username);
      setPhase('waiting');
      await refreshState(id);
    } catch (err: any) { showError(err?.response?.data?.message || 'Failed to join'); }
  };

  // Auto-join when arriving via a chat invite
  useEffect(() => {
    if (initialRoomId) handleJoin(initialRoomId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialRoomId]);

  const handleStart = async () => {
    try {
      await DiceAPI.start(roomId, username);
      await refreshState(roomId);
    } catch (err: any) { showError(err?.response?.data?.message || 'Failed to start'); }
  };

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  const handleAction = async (action: string, extra?: any) => {
    setIsActing(true);

    if (action === 'roll') {
      // Server-first: learn the outcome, then play a deterministic 3D throw that
      // lands exactly on the rolled faces before committing the new state.
      rollingRef.current = true;
      setRolling(true);
      try {
        const res = await DiceAPI.action(roomId, { username, action, ...extra });
        const d = res.data || res;
        const r = d.result || d;
        const ns = d.state;

        // Resolve the faces to land on. PIG returns a single int (`rolled`);
        // FARKLE / SHIP_CAPTAIN_CREW return a list. Prefer the freshly-rolled
        // result over state (state may have advanced or cleared on a bust).
        const nsMine = ns?.players?.find((p: any) => p.username === username);
        const raw: any =
          r.rolled ?? r.dice ??
          ns?.gameState?.rolled ?? ns?.gameState?.currentRoll ?? ns?.gameState?.lastRoll ??
          nsMine?.hand;
        let dice: number[] =
          typeof raw === 'number' ? [raw]
          : Array.isArray(raw) && raw.length > 0 ? raw
          : [1 + Math.floor(Math.random() * 6)];
        dice = dice.map((n: number) => Math.min(6, Math.max(1, n | 0)) || 1);

        setPendingDice(dice);
        setRollId((id) => id + 1);

        // Hold the throw until the last staggered die has settled.
        await sleep(DICE_ROLL_MS + dice.length * DICE_STAGGER + 280);

        // Commit the outcome now that the dice have landed — the reveal lands with the die.
        setResult(r);
        if (r.busted || r.event === 'BUST' || r.event === 'FARKLE') {
          setBustFlash(true);
          showScorePopup(r.event === 'FARKLE' ? '💥 FARKLE!' : '💀 BUST!', 'text-red-400');
          setTimeout(() => setBustFlash(false), 1500);
        } else if (r.scored || r.turnScore) {
          showScorePopup(`+${r.scored || r.turnScore}`, 'text-green-400');
        }

        if (ns) {
          setState(ns);
          if (ns.status === 'FINISHED' || ns.status === 'ENDED') {
            setPhase('gameover');
            if (ns.winner === username) setWinConfetti(true);
          }
          if (ns.eventLog) setEventLog(ns.eventLog.slice(-10));
        } else await refreshState(roomId);
        setSelectedIndices([]);
      } catch (err: any) {
        showError(err?.response?.data?.message || 'Action failed');
      } finally {
        rollingRef.current = false;
        setRolling(false);
        setPendingDice(null);
        setIsActing(false);
      }
      return;
    }

    // Non-roll actions
    try {
      const res = await DiceAPI.action(roomId, { username, action, ...extra });
      const d = res.data || res;
      setResult(d.result || d);

      const r = d.result || d;
      if (action === 'hold' || action === 'bank' || action === 'stop') {
        showScorePopup(`+${r.banked || r.scored || r.cargo || 0} banked!`, 'text-yellow-400');
      }
      if (action === 'challenge') {
        showScorePopup(r.challengerWon ? '✅ Liar caught!' : '❌ Bad call!', r.challengerWon ? 'text-green-400' : 'text-red-400');
      }

      if (d.state) {
        setState(d.state);
        if (d.state.status === 'FINISHED' || d.state.status === 'ENDED') {
          setPhase('gameover');
          if (d.state.winner === username) setWinConfetti(true);
        }
        if (d.state.eventLog) setEventLog(d.state.eventLog.slice(-10));
      } else await refreshState(roomId);
      setSelectedIndices([]);
    } catch (err: any) { showError(err?.response?.data?.message || 'Action failed'); }
    finally { setIsActing(false); }
  };

  const handleCopy = () => { navigator.clipboard.writeText(roomId); setCopied(true); setTimeout(() => setCopied(false), 2000); };

  const isMyTurn = state?.currentPlayer === username;
  const myPlayer = state?.players?.find((p: any) => p.username === username);
  const players = state?.players || [];
  const hostName = state?.hostUsername || state?.host || (players.length > 0 ? players[0].username : '');
  const isHost = hostName === username;

  // ═══════════════════════════════════════
  return (
    <div className={`flex flex-col h-full w-full bg-[#0B1120] transition-all ${bustFlash ? 'bg-red-900/30' : ''}`}>

      {/* Win confetti overlay */}
      {winConfetti && (
        <div className="fixed inset-0 z-50 pointer-events-none overflow-hidden">
          {Array.from({ length: 50 }).map((_, i) => (
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
              {['🎉', '🏆', '⭐', '🎊', '✨', '🎲'][Math.floor(Math.random() * 6)]}
            </div>
          ))}
        </div>
      )}

      {/* Score popup */}
      {scorePopup && (
        <div className="fixed top-1/3 left-1/2 -translate-x-1/2 z-50 pointer-events-none">
          <div className={`text-4xl sm:text-5xl font-extrabold ${scorePopup.color} animate-bounce drop-shadow-lg`}>
            {scorePopup.text}
          </div>
        </div>
      )}

      {/* Header */}
      <header className="h-14 sm:h-16 px-3 sm:px-6 border-b border-white/[0.06] flex items-center gap-2 sm:gap-3 shrink-0 bg-[#0F172A]/80 backdrop-blur-sm z-10">
        <button onClick={onBack} className="p-1.5 hover:bg-white/[0.04] rounded-xl text-slate-400">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <HowToPlay title={`How to play · ${info.name}`} steps={DICE_RULES[gameType]} />
        <div className={`w-9 h-9 rounded-lg bg-gradient-to-br ${info.color} flex items-center justify-center shrink-0 text-lg`}>
          {info.emoji}
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="font-bold text-sm sm:text-base text-white truncate">{info.name}</h2>
          <p className="text-[10px] sm:text-xs text-slate-400 truncate">
            {phase === 'lobby' ? info.desc : phase === 'waiting' ? `${players.length} players in lobby` : isMyTurn ? '🟢 Your turn!' : `⏳ ${state?.currentPlayer}'s turn`}
          </p>
        </div>
        {roomId && <span className="hidden sm:inline text-[10px] bg-white/[0.04] border border-white/[0.08] rounded-full px-2.5 py-1 font-mono text-slate-500">{roomId}</span>}
      </header>

      {error && <div className="mx-3 sm:mx-6 mt-2 bg-red-500/10 border border-red-500/20 text-red-400 px-3 py-2 rounded-xl text-xs text-center animate-pulse">{error}</div>}

      <div className="flex-1 overflow-y-auto flex items-center justify-center p-3 sm:p-6 pb-20 lg:pb-6">

        {/* ── LOBBY ── */}
        {phase === 'lobby' && (
          <div className="w-full max-w-sm flex flex-col gap-5">
            <div className="flex flex-col items-center gap-4">
              <div className={`w-20 h-20 rounded-3xl bg-gradient-to-br ${info.color} flex items-center justify-center shadow-2xl text-4xl`}>
                {info.emoji}
              </div>
              <h3 className="text-2xl font-extrabold text-white">{info.name}</h3>
              <p className="text-sm text-slate-400 text-center max-w-xs">{info.desc}</p>
              {info.target > 0 && (
                <span className="text-xs bg-white/[0.04] border border-white/[0.08] rounded-full px-3 py-1 text-slate-400">
                  Target: {info.target.toLocaleString()} pts
                </span>
              )}
            </div>
            <Button variant="primary" size="lg" className={`w-full bg-gradient-to-r ${info.color} border-0 rounded-2xl h-14 text-lg font-bold shadow-lg hover:scale-[1.02] transition-transform`} onClick={handleCreate} isLoading={isCreating}>
              🎲 Create Room
            </Button>
            <div className="flex items-center gap-4"><div className="flex-1 h-px bg-white/[0.06]" /><span className="text-slate-600 text-xs">OR JOIN</span><div className="flex-1 h-px bg-white/[0.06]" /></div>
            <div className="flex gap-2">
              <input type="text" placeholder="Enter Room ID..." value={roomInput} onChange={e => setRoomInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleJoin()}
                className="flex-1 h-12 bg-white/[0.04] border border-white/[0.08] rounded-xl pl-4 text-sm text-white focus:outline-none focus:border-white/20 placeholder:text-slate-600" />
              <Button variant="primary" className="rounded-xl h-12 px-6 bg-gradient-to-r from-accent-purple to-accent-hover border-0 font-bold" onClick={() => handleJoin()} disabled={!roomInput.trim()}>Join</Button>
            </div>
          </div>
        )}

        {/* ── WAITING ── */}
        {phase === 'waiting' && (
          <div className="w-full max-w-sm flex flex-col items-center gap-5">
            <div className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${info.color} flex items-center justify-center shadow-xl text-3xl animate-pulse`}>
              {info.emoji}
            </div>
            <h3 className="text-xl font-bold text-white">{info.name}</h3>
            <button onClick={handleCopy} className="flex items-center gap-2 bg-white/[0.04] border border-white/[0.08] rounded-xl px-5 py-3 hover:border-white/20 transition-all hover:scale-105">
              <span className="font-mono font-bold text-sm text-white">{roomId}</span>
              {copied ? <CheckCircle className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4 text-slate-500" />}
            </button>

            <GameInviteButton currentUser={currentUser} kind="dice" diceType={gameType} roomId={roomId} label={info.name} />
            <div className="w-full bg-[#131C2E] border border-white/[0.06] rounded-2xl overflow-hidden">
              <div className="px-4 py-3 border-b border-white/[0.06] flex items-center justify-between">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Players ({players.length})</span>
                <Users className="w-4 h-4 text-slate-600" />
              </div>
              {players.map((p: any) => (
                <div key={p.username} className="flex items-center gap-3 px-4 py-3.5 border-b border-white/[0.03] last:border-0">
                  <div className="w-10 h-10 rounded-full bg-white/[0.04] border border-white/[0.08] flex items-center justify-center text-xl">
                    {getAvatarEmoji(p.profileAvatar)}
                  </div>
                  <span className="font-semibold text-sm text-white flex-1">{p.username}{p.username === username ? ' (you)' : ''}</span>
                  {hostName === p.username && <Crown className="w-4 h-4 text-yellow-500" />}
                </div>
              ))}
            </div>
            {isHost ? (
              <Button variant="primary" size="lg" className={`w-full bg-gradient-to-r ${info.color} border-0 rounded-2xl h-14 text-lg font-bold shadow-lg hover:scale-[1.02] transition-transform`} onClick={handleStart} disabled={players.length < 2}>
                <Play className="w-6 h-6 mr-2" /> {players.length < 2 ? 'Need 2+ players' : 'Start Game!'}
              </Button>
            ) : (
              <div className="flex items-center gap-2 text-slate-500 py-3">
                <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
                <span className="text-sm">Waiting for host to start...</span>
              </div>
            )}
          </div>
        )}

        {/* ── PLAYING ── */}
        {phase === 'playing' && state && (
          <div className="w-full max-w-lg flex flex-col gap-4">

            {/* Player scoreboard */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 sm:gap-5 -mt-2">
              {players.map((p: any) => {
                const isCurrent = state.currentPlayer === p.username;
                const isMe = p.username === username;
                return (
                  <div key={p.username} className={`relative bg-[#131C2E] border-2 rounded-2xl p-4 sm:p-5 text-center transition-all duration-300 ${
                    isCurrent ? 'border-yellow-500/50 shadow-lg shadow-yellow-500/10 scale-[1.03]' : 'border-white/[0.06]'
                  } ${p.eliminated ? 'opacity-30 grayscale' : ''}`}>
                    {isCurrent && <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-8 h-1 rounded-full bg-yellow-500" />}
                    <div className="text-2xl mb-1">{getAvatarEmoji(p.profileAvatar)}</div>
                    <p className="text-xs font-semibold text-white truncate">{isMe ? 'You' : p.username}</p>
                    <p className={`text-xl sm:text-2xl font-extrabold mt-1 transition-all ${isCurrent ? 'text-yellow-400' : 'text-slate-300'}`}>
                      {p.score}
                    </p>
                    {gameType === 'LIARS_DICE' && (
                      <div className="flex justify-center gap-0.5 mt-1">
                        {Array.from({ length: p.diceCount || 0 }).map((_, i) => (
                          <span key={i} className="text-[10px]">🎲</span>
                        ))}
                      </div>
                    )}
                    {isCurrent && !p.eliminated && (
                      <span className="inline-block mt-1 text-[9px] text-yellow-400 font-bold bg-yellow-500/10 px-2 py-0.5 rounded-full animate-pulse">
                        PLAYING
                      </span>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Turn score bar */}
            {state.gameState?.turnScore != null && (
              <div className={`bg-[#131C2E] border border-white/[0.06] rounded-2xl px-5 py-4 flex items-center justify-between transition-all ${
                state.gameState.turnScore > 0 ? 'border-yellow-500/20' : ''
              }`}>
                <span className="text-sm text-slate-400 font-medium">Turn Score</span>
                <div className="flex items-center gap-2">
                  <span className={`text-2xl font-extrabold transition-all ${state.gameState.turnScore > 0 ? 'text-yellow-400' : 'text-slate-500'}`}>
                    {state.gameState.turnScore}
                  </span>
                  {state.gameState.remainingDice != null && (
                    <span className="text-xs text-slate-500 bg-white/[0.04] rounded-full px-2 py-0.5">
                      {state.gameState.remainingDice} dice left
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Dice display */}
            <div className={`bg-[#131C2E] border border-white/[0.06] rounded-2xl p-5 sm:p-6 transition-all ${bustFlash ? 'border-red-500/40 bg-red-900/10' : ''}`}>
              <div className="flex items-center justify-between mb-4">
                <p className="text-xs text-slate-500 uppercase font-bold tracking-wider">
                  {rolling ? '🎲 Rolling...' : gameType === 'FARKLE' && state.gameState?.rolled ? 'Rolled Dice' : gameType === 'LIARS_DICE' ? 'Your Hidden Hand' : 'Dice'}
                </p>
                {gameType === 'FARKLE' && selectedIndices.length > 0 && (
                  <span className="text-[10px] text-yellow-400 bg-yellow-500/10 px-2 py-0.5 rounded-full font-bold">
                    {selectedIndices.length} selected
                  </span>
                )}
              </div>

              {(() => {
                const lr = state.gameState?.lastRoll;
                const restingDice: number[] =
                  state.gameState?.rolled
                  || state.gameState?.currentRoll
                  || (typeof lr === 'number' ? [lr] : null)
                  || myPlayer?.hand
                  || [];
                return (
              <div className="flex justify-center items-end gap-2 sm:gap-4 flex-wrap min-h-[96px]">
                {rolling ? (
                  // Cinematic 3D throw — each die lands on its real face, lightly staggered.
                  (pendingDice || [1]).map((val, i) => (
                    <Dice3D key={i} value={val} rolling rollId={rollId} size={58} delay={i * DICE_STAGGER} />
                  ))
                ) : (
                  restingDice.map((val: number, i: number) => {
                    const isSelected = selectedIndices.includes(i);
                    const canSelect = gameType === 'FARKLE' && isMyTurn;
                    return (
                      <button
                        key={i}
                        onClick={() => {
                          if (!canSelect) return;
                          setSelectedIndices(prev => prev.includes(i) ? prev.filter(x => x !== i) : [...prev, i]);
                        }}
                        className={`rounded-2xl flex items-center justify-center transition-all duration-200 ${
                          isSelected
                            ? 'bg-yellow-500/20 ring-2 ring-yellow-400 scale-110 shadow-yellow-500/20'
                            : 'hover:scale-105'
                        } ${canSelect ? 'cursor-pointer active:scale-95' : 'cursor-default'}
                        ${val === 1 && gameType === 'PIG' ? 'ring-2 ring-red-500/50' : ''}`}
                      >
                        <Dice3D value={val} rolling={false} size={58} />
                      </button>
                    );
                  })
                )}
                {!rolling && !restingDice.length && (
                  <div className="text-slate-600 text-sm py-6">Roll the dice to start!</div>
                )}
              </div>
                );
              })()}
            </div>

            {/* Liar's Dice — Current Bid */}
            {gameType === 'LIARS_DICE' && state.gameState?.currentBid && (
              <div className="bg-[#131C2E] border border-white/[0.06] rounded-2xl px-5 py-4 text-center">
                <span className="text-xs text-slate-500 block mb-2">Current Bid</span>
                <div className="flex items-center justify-center gap-3">
                  <span className="text-3xl font-extrabold text-white">{state.gameState.currentBid.quantity}×</span>
                  <span className="text-4xl">{DICE_FACES[(state.gameState.currentBid.faceValue || 1) - 1]}</span>
                </div>
                <span className="text-xs text-slate-500 mt-2 block">by {state.gameState.currentBid.bidder}</span>
              </div>
            )}

            {/* Event Log */}
            {eventLog.length > 0 && (
              <div className="bg-[#131C2E] border border-white/[0.06] rounded-2xl max-h-32 overflow-y-auto">
                <div className="px-4 py-2 border-b border-white/[0.04]">
                  <span className="text-[10px] text-slate-600 uppercase font-bold tracking-wider">Game Log</span>
                </div>
                <div className="p-3">
                  {eventLog.map((e, i) => (
                    <p key={i} className={`text-xs py-1 ${i === eventLog.length - 1 ? 'text-slate-300 font-medium' : 'text-slate-600'}`}>
                      {e}
                    </p>
                  ))}
                </div>
              </div>
            )}

            {/* Action Buttons */}
            {isMyTurn && !rolling && (
              <div className="bg-[#0F172A] border border-white/[0.06] rounded-2xl p-4 sm:p-5">
                {gameType === 'PIG' && (
                  <div className="flex gap-3">
                    <Button variant="primary" className={`flex-1 rounded-2xl h-14 bg-gradient-to-r ${info.color} border-0 text-lg font-bold shadow-lg hover:scale-[1.02] transition-transform`}
                      onClick={() => handleAction('roll')} isLoading={isActing}>
                      🎲 Roll
                    </Button>
                    <Button variant="outline" className="flex-1 rounded-2xl h-14 text-lg font-bold border-white/10 text-white hover:bg-white/[0.04]"
                      onClick={() => handleAction('hold')} disabled={isActing}>
                      ✋ Hold
                    </Button>
                  </div>
                )}

                {gameType === 'FARKLE' && (
                  <div className="flex flex-col gap-3">
                    <div className="flex gap-3">
                      <Button variant="primary" className={`flex-1 rounded-2xl h-14 bg-gradient-to-r ${info.color} border-0 text-lg font-bold shadow-lg hover:scale-[1.02] transition-transform`}
                        onClick={() => handleAction('roll')} isLoading={isActing}>
                        🎲 Roll
                      </Button>
                      <Button variant="outline" className="flex-1 rounded-2xl h-14 text-lg font-bold border-white/10 text-white hover:bg-white/[0.04]"
                        onClick={() => handleAction('bank')} disabled={isActing}>
                        💰 Bank
                      </Button>
                    </div>
                    {selectedIndices.length > 0 && (
                      <Button variant="primary" className="w-full rounded-2xl h-12 bg-gradient-to-r from-green-500 to-emerald-600 border-0 font-bold shadow-lg hover:scale-[1.02] transition-transform"
                        onClick={() => handleAction('keep', { indices: selectedIndices })} disabled={isActing}>
                        ✅ Keep {selectedIndices.length} dice
                      </Button>
                    )}
                  </div>
                )}

                {gameType === 'LIARS_DICE' && (
                  <div className="flex flex-col gap-3">
                    <div className="flex gap-2 items-end">
                      <div className="flex-1">
                        <label className="text-[10px] text-slate-500 uppercase font-bold mb-1.5 block">Qty</label>
                        <input type="number" min={1} value={bidQty} onChange={e => setBidQty(+e.target.value)}
                          className="w-full h-12 bg-white/[0.04] border border-white/[0.08] rounded-xl px-3 text-base text-white text-center font-bold" />
                      </div>
                      <div className="flex-1">
                        <label className="text-[10px] text-slate-500 uppercase font-bold mb-1.5 block">Face</label>
                        <div className="flex gap-1.5">
                          {[1,2,3,4,5,6].map(n => (
                            <button key={n} onClick={() => setBidFace(n)}
                              className={`flex-1 h-12 rounded-xl text-xl flex items-center justify-center transition-all ${
                                bidFace === n ? 'bg-red-500/20 border-2 border-red-400 scale-110' : 'bg-white/[0.04] border border-white/[0.08] hover:bg-white/[0.06]'
                              }`}>
                              {DICE_FACES[n-1]}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-3">
                      <Button variant="primary" className={`flex-1 rounded-2xl h-12 bg-gradient-to-r ${info.color} border-0 font-bold shadow-lg`}
                        onClick={() => handleAction('bid', { quantity: bidQty, faceValue: bidFace })} disabled={isActing}>
                        📢 Bid {bidQty}× {DICE_FACES[bidFace-1]}
                      </Button>
                      {state.gameState?.currentBid && (
                        <Button variant="outline" className="flex-1 rounded-2xl h-12 font-bold border-red-500/30 text-red-400 hover:bg-red-500/10 hover:scale-[1.02] transition-transform"
                          onClick={() => handleAction('challenge')} disabled={isActing}>
                          🕵️ LIAR!
                        </Button>
                      )}
                    </div>
                  </div>
                )}

                {gameType === 'SHIP_CAPTAIN_CREW' && (
                  <div className="flex flex-col gap-3">
                    {state.gameState?.locked && (
                      <div className="flex items-center justify-center gap-2 text-sm text-slate-400 bg-white/[0.02] rounded-xl py-2">
                        Locked: {state.gameState.locked.map((v: number) => DICE_FACES[v-1]).join(' ')}
                        {state.gameState.rollsLeft != null && <span className="text-xs text-slate-600 ml-2">({state.gameState.rollsLeft} rolls left)</span>}
                      </div>
                    )}
                    <div className="flex gap-3">
                      <Button variant="primary" className={`flex-1 rounded-2xl h-14 bg-gradient-to-r ${info.color} border-0 text-lg font-bold shadow-lg hover:scale-[1.02] transition-transform`}
                        onClick={() => handleAction('roll')} isLoading={isActing}>
                        🎲 Roll
                      </Button>
                      <Button variant="outline" className="flex-1 rounded-2xl h-14 text-lg font-bold border-white/10 text-white hover:bg-white/[0.04]"
                        onClick={() => handleAction('stop')} disabled={isActing}>
                        ⚓ Stop
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {!isMyTurn && !rolling && (
              <div className="flex items-center justify-center gap-3 py-5 bg-[#131C2E] border border-white/[0.06] rounded-2xl">
                <div className="flex gap-1">
                  {[0, 150, 300].map(d => <div key={d} className="w-2.5 h-2.5 rounded-full bg-slate-500 animate-bounce" style={{ animationDelay: `${d}ms` }} />)}
                </div>
                <span className="text-sm text-slate-400">Waiting for <strong className="text-white">{state.currentPlayer}</strong>...</span>
              </div>
            )}
          </div>
        )}

        {/* ── GAME OVER ── */}
        {phase === 'gameover' && state && (
          <div className="w-full max-w-sm flex flex-col items-center gap-6">
            <div className={`w-24 h-24 rounded-full flex items-center justify-center shadow-2xl text-5xl ${
              state.winner === username
                ? 'bg-gradient-to-br from-yellow-400 to-amber-600 animate-bounce'
                : 'bg-gradient-to-br from-slate-600 to-slate-700'
            }`}>
              {state.winner === username ? '🏆' : '😞'}
            </div>
            <div className="text-center">
              <h2 className="text-3xl font-extrabold text-white mb-1">
                {state.winner === username ? 'You Won!' : `${state.winner} Wins!`}
              </h2>
              {state.winner === username && <p className="text-lg text-yellow-400">🎉 Congratulations! 🎉</p>}
            </div>

            {/* Final scoreboard */}
            <div className="w-full bg-[#131C2E] border border-white/[0.06] rounded-2xl overflow-hidden">
              <div className="px-5 py-3 border-b border-white/[0.06]">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                  <Trophy className="w-3.5 h-3.5 text-yellow-500" /> Final Standings
                </span>
              </div>
              {[...players].sort((a: any, b: any) => b.score - a.score).map((p: any, i: number) => (
                <div key={p.username} className={`flex items-center gap-3 px-5 py-4 border-b border-white/[0.03] last:border-0 transition-all ${
                  p.username === state.winner ? 'bg-yellow-500/5' : p.username === username ? 'bg-accent-purple/5' : ''
                }`}>
                  <span className="text-2xl w-9 text-center">{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i+1}`}</span>
                  <div className="w-10 h-10 rounded-full bg-white/[0.04] border border-white/[0.08] flex items-center justify-center text-xl">
                    {getAvatarEmoji(p.profileAvatar)}
                  </div>
                  <span className="font-semibold text-sm text-white flex-1">{p.username === username ? 'You' : p.username}</span>
                  <span className={`text-base font-extrabold ${i === 0 ? 'text-yellow-400' : 'text-slate-400'}`}>{p.score}</span>
                </div>
              ))}
            </div>

            <div className="flex gap-3 w-full">
              <Button variant="outline" className="flex-1 rounded-2xl h-12 border-white/10 text-white font-bold" onClick={() => { setWinConfetti(false); onBack(); }}>
                Leave
              </Button>
              <Button variant="primary" className={`flex-1 rounded-2xl h-12 bg-gradient-to-r ${info.color} border-0 font-bold shadow-lg`}
                onClick={() => { setWinConfetti(false); setPhase('lobby'); setRoomId(''); setState(null); setResult(null); setEventLog([]); }}>
                <RotateCcw className="w-4 h-4 mr-2" /> Play Again
              </Button>
            </div>
          </div>
        )}
      </div>

    </div>
  );
};
