import { useState, useEffect, useRef, useCallback } from 'react';
import {
  ArrowLeft, Check, Eye, Shuffle, Brain, Crown, Copy, Users, Loader2, Trophy, RotateCcw, Bot, X,
  MessageCircle, Send, Smile,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  DndContext, closestCenter, PointerSensor, TouchSensor, useSensor, useSensors,
} from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import {
  SortableContext, horizontalListSortingStrategy, useSortable, arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { BottleAPI } from '../../services/api';
import { HowToPlay } from './HowToPlay';

// ── Bottle palette ──
interface BottleDef { key: string; label: string; body: string; cap: string; emoji: string }

// Keep these in sync with BottleGameService.ALL_COLORS — same keys & order.
const BOTTLES: BottleDef[] = [
  { key: 'RED',    label: 'Red',    body: 'from-red-400 to-red-600',         cap: 'bg-red-800',     emoji: '🟥' },
  { key: 'BLUE',   label: 'Blue',   body: 'from-blue-400 to-blue-600',       cap: 'bg-blue-800',    emoji: '🟦' },
  { key: 'GREEN',  label: 'Green',  body: 'from-emerald-400 to-emerald-600', cap: 'bg-emerald-800', emoji: '🟩' },
  { key: 'YELLOW', label: 'Yellow', body: 'from-yellow-300 to-yellow-500',   cap: 'bg-yellow-700',  emoji: '🟨' },
  { key: 'PURPLE', label: 'Purple', body: 'from-purple-400 to-fuchsia-600',  cap: 'bg-purple-800',  emoji: '🟪' },
  { key: 'ORANGE', label: 'Orange', body: 'from-orange-400 to-orange-600',   cap: 'bg-orange-800',  emoji: '🟧' },
  { key: 'PINK',   label: 'Pink',   body: 'from-pink-400 to-pink-600',       cap: 'bg-pink-800',    emoji: '🩷' },
  { key: 'CYAN',   label: 'Cyan',   body: 'from-cyan-300 to-cyan-500',       cap: 'bg-cyan-700',    emoji: '🩵' },
  { key: 'BROWN',  label: 'Brown',  body: 'from-amber-700 to-amber-900',     cap: 'bg-amber-950',   emoji: '🟫' },
  { key: 'WHITE',  label: 'White',  body: 'from-slate-100 to-slate-300',     cap: 'bg-slate-400',   emoji: '⬜' },
];
const BY_KEY: Record<string, BottleDef> = Object.fromEntries(BOTTLES.map(b => [b.key, b]));
const DEFAULT_COLORS = BOTTLES.slice(0, 5).map(b => b.key);
const BOTTLE_COUNT_OPTIONS = [5, 7, 10] as const;
type BottleCount = (typeof BOTTLE_COUNT_OPTIONS)[number];

type Phase = 'lobby' | 'waiting' | 'play' | 'finished';

interface PlayerView { username: string; bot?: boolean; attempts: number; solved: boolean; solvedAtAttempt?: number; finishRank?: number; yourLastMatches?: number }
interface ChatMsg { id: number; sender: string; message: string; ts: number }
const QUICK_EMOJI = ['👍', '😂', '🔥', '🎉', '😮', '😭', '🤔', '👏'];
interface RoomView {
  roomId: string; host: string; status: string; maxPlayers: number; minPlayers: number;
  winner: string | null; colors: string[]; memorizeSeconds: number; memorizeEndsAt: number;
  startedAt: number; serverNow: number; memorizing: boolean; players: PlayerView[]; revealOrder?: string[];
  chat?: ChatMsg[]; bottleCount?: number;
}

// Fisher–Yates shuffle guaranteed to differ from the input.
const shuffleDistinct = (arr: string[]): string[] => {
  const out = [...arr];
  if (out.length < 2) return out;
  do {
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
  } while (out.every((k, i) => k === arr[i]));
  return out;
};

// ── A single bottle drawing ──
const BottleGlass = ({ def, hidden, small }: { def?: BottleDef; hidden?: boolean; small?: boolean }) => (
  <div className="relative flex flex-col items-center select-none pointer-events-none">
    <div className={`w-4 h-3 rounded-t-sm ${hidden ? 'bg-text-muted/50' : def?.cap ?? 'bg-text-muted/50'}`} />
    <div className={`w-3.5 h-3 ${hidden ? 'bg-text-muted/30' : 'bg-white/30'}`} />
    <div
      className={`${small ? 'w-9 h-14' : 'w-12 sm:w-14 h-20 sm:h-24'} rounded-b-2xl rounded-t-lg flex items-center justify-center text-2xl shadow-inner ${
        hidden
          ? 'bg-bg-tertiary border-2 border-dashed border-border-hover text-text-muted'
          : `bg-gradient-to-b ${def?.body} shadow-lg`
      }`}
    >
      {hidden ? '❓' : <span className="drop-shadow-sm">{def?.emoji}</span>}
    </div>
  </div>
);

// ── Sortable / clickable bottle ──
const PlayBottle = ({
  bottleKey, index, selected, onSelect, disabled,
}: {
  bottleKey: string; index: number; selected: boolean; onSelect: () => void; disabled?: boolean;
}) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: bottleKey, disabled });
  const style = { transform: CSS.Transform.toString(transform), transition, zIndex: isDragging ? 50 : undefined };
  return (
    <div
      ref={setNodeRef}
      style={style}
      {...(disabled ? {} : attributes)}
      {...(disabled ? {} : listeners)}
      onClick={disabled ? undefined : onSelect}
      className={`relative flex flex-col items-center gap-2 touch-none rounded-2xl p-2 sm:p-3 transition-colors ${
        disabled ? 'cursor-default' : 'cursor-grab active:cursor-grabbing'
      } ${selected ? 'bg-accent-orange/15 ring-2 ring-accent-orange' : 'hover:bg-hover-bg ring-2 ring-transparent'} ${isDragging ? 'opacity-80' : ''}`}
    >
      <span className="absolute -top-1 -left-1 w-5 h-5 rounded-full bg-bg-tertiary border border-border-color text-[10px] font-bold flex items-center justify-center text-text-secondary">
        {index + 1}
      </span>
      <BottleGlass def={BY_KEY[bottleKey]} />
    </div>
  );
};

export const BottleShuffle = ({ currentUser, onBack, initialRoomId }: { currentUser: any; onBack: () => void; initialRoomId?: string }) => {
  const username = currentUser?.username || '';

  const [phase, setPhase] = useState<Phase>('lobby');
  const [roomId, setRoomId] = useState('');
  const [roomInput, setRoomInput] = useState('');
  const [bottleCount, setBottleCount] = useState<BottleCount>(5);
  const [state, setState] = useState<RoomView | null>(null);
  const [arrangement, setArrangement] = useState<string[]>(DEFAULT_COLORS);
  const [selected, setSelected] = useState<string | null>(null);
  const [myLastMatches, setMyLastMatches] = useState<number | null>(null);
  const [swaps, setSwaps] = useState(0);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  // ── In-game chat (rides the same poll channel; non-intrusive overlay) ──
  const [chatOpen, setChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [lastSeenChatId, setLastSeenChatId] = useState(0);
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const messages: ChatMsg[] = state?.chat || [];
  const unreadChat = messages.filter(m => m.id > lastSeenChatId && m.sender !== username).length;

  const roundRef = useRef<number>(0);        // startedAt of the round we initialised arrangement for

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 120, tolerance: 8 } }),
  );

  const colors = state?.colors?.length ? state.colors : DEFAULT_COLORS;
  const myPlayer = state?.players?.find(p => p.username === username);
  const isHost = state?.host === username;
  const iSolved = !!myPlayer?.solved;

  const showError = (msg: string) => { setError(msg); setTimeout(() => setError(''), 4000); };

  // ── Derive phase from server state ──
  const applyState = useCallback((d: RoomView) => {
    setState(d);
    if (d.status === 'WAITING') setPhase('waiting');
    else if (d.status === 'FINISHED') setPhase('finished');
    else if (d.status === 'IN_PROGRESS') setPhase('play');
  }, []);

  // Initialise the player's working arrangement once per round (a fresh shuffle).
  useEffect(() => {
    if (phase === 'play' && state && roundRef.current !== state.startedAt) {
      roundRef.current = state.startedAt;
      setArrangement(shuffleDistinct(colors));
      setSelected(null);
      setMyLastMatches(null);
      setSwaps(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, state?.startedAt]);

  // ── Polling ──
  const refresh = useCallback(async (rid: string) => {
    try {
      const res = await BottleAPI.getRoom(rid, username);
      applyState(res.data || res);
    } catch (err: any) { showError(err?.response?.data?.message || 'Failed to refresh room'); }
  }, [username, applyState]);

  useEffect(() => {
    // Keep polling in every joined phase (incl. 'finished') so a host rematch
    // propagates to the other players.
    if (!roomId || phase === 'lobby') return;
    const iv = setInterval(() => refresh(roomId), 1500);
    return () => clearInterval(iv);
  }, [roomId, phase, refresh]);

  // ── Room lifecycle ──
  const handleCreate = async () => {
    if (!username) return showError('You must be logged in to play');
    setBusy(true);
    try {
      const res = await BottleAPI.createRoom({ hostUsername: username, maxPlayers: 4, bottleCount });
      const d = res.data || res;
      setRoomId(d.roomId);
      applyState(d);
    } catch (err: any) { showError(err?.response?.data?.message || 'Failed to create room'); }
    finally { setBusy(false); }
  };

  const handleJoin = async (rid?: string) => {
    const id = (rid || roomInput).trim().toUpperCase();
    if (!id) return;
    setBusy(true);
    try {
      const res = await BottleAPI.join(id, username);
      setRoomId(id);
      applyState(res.data || res);
    } catch (err: any) { showError(err?.response?.data?.message || 'Failed to join room'); }
    finally { setBusy(false); }
  };

  useEffect(() => {
    if (initialRoomId) handleJoin(initialRoomId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialRoomId]);

  const handleStart = async () => {
    setBusy(true);
    try { const res = await BottleAPI.start(roomId, username); applyState(res.data || res); }
    catch (err: any) { showError(err?.response?.data?.message || 'Failed to start'); }
    finally { setBusy(false); }
  };

  const handleAddBot = async () => {
    setBusy(true);
    try { const res = await BottleAPI.addBot(roomId, username); applyState(res.data || res); }
    catch (err: any) { showError(err?.response?.data?.message || 'Failed to add bot'); }
    finally { setBusy(false); }
  };

  const handleRemoveBot = async (botName: string) => {
    try { const res = await BottleAPI.removeBot(roomId, username, botName); applyState(res.data || res); }
    catch (err: any) { showError(err?.response?.data?.message || 'Failed to remove bot'); }
  };

  const sendChat = async (msg: string) => {
    const text = msg.trim();
    if (!text || !roomId) return;
    setChatInput('');
    try { const res = await BottleAPI.chat(roomId, username, text); applyState(res.data || res); }
    catch (err: any) { showError(err?.response?.data?.message || 'Failed to send'); }
  };

  // Mark messages read + autoscroll while the panel is open.
  useEffect(() => {
    if (!chatOpen) return;
    const latest = messages.length ? messages[messages.length - 1].id : 0;
    if (latest > lastSeenChatId) setLastSeenChatId(latest);
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatOpen, messages.length, lastSeenChatId]);

  const handleLeave = async () => {
    if (roomId) { try { await BottleAPI.leave(roomId, username); } catch { /* ignore */ } }
    onBack();
  };

  const handleRematch = async () => {
    setBusy(true);
    try { const res = await BottleAPI.rematch(roomId, username); roundRef.current = 0; applyState(res.data || res); }
    catch (err: any) { showError(err?.response?.data?.message || 'Failed to start rematch'); }
    finally { setBusy(false); }
  };

  // ── Gameplay ──
  const handleSelect = (key: string) => {
    if (phase !== 'play' || iSolved) return;
    if (selected === null) { setSelected(key); return; }
    if (selected === key) { setSelected(null); return; }
    setArrangement(prev => {
      const a = prev.indexOf(selected), b = prev.indexOf(key);
      const copy = [...prev];
      [copy[a], copy[b]] = [copy[b], copy[a]];
      return copy;
    });
    setSwaps(s => s + 1);
    setSelected(null);
  };

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    setArrangement(prev => arrayMove(prev, prev.indexOf(active.id as string), prev.indexOf(over.id as string)));
    setSwaps(s => s + 1);
    setSelected(null);
  };

  const handleSubmit = async () => {
    setBusy(true);
    try {
      const res = await BottleAPI.submit(roomId, { username, arrangement });
      const d = res.data || res;
      setMyLastMatches(d?.result?.matches ?? null);
      if (d?.state) applyState(d.state);
    } catch (err: any) { showError(err?.response?.data?.message || 'Failed to submit'); }
    finally { setBusy(false); }
  };

  const copyRoom = () => { navigator.clipboard?.writeText(roomId); setCopied(true); setTimeout(() => setCopied(false), 1500); };

  // ── Render helpers ──
  const Header = (
    <header className="h-14 sm:h-16 px-3 sm:px-6 border-b border-border-color flex items-center gap-3 shrink-0 bg-bg-secondary/80 backdrop-blur-sm z-10">
      <button onClick={handleLeave} className="p-1.5 sm:p-2 hover:bg-bg-tertiary rounded-xl transition-colors text-text-secondary">
        <ArrowLeft className="w-5 h-5" />
      </button>
      <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-500/20 shrink-0">
        <Brain className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
      </div>
      <div className="min-w-0 flex-1">
        <h2 className="font-bold text-sm sm:text-base text-text-primary leading-tight truncate">Bottle Shuffle Match</h2>
        <p className="text-[10px] sm:text-xs text-text-secondary truncate">Crack the secret order in the fewest guesses</p>
      </div>
      <HowToPlay
        title="How to play · Bottle Shuffle"
        steps={[
          'The bottles are locked in a hidden secret order — no peeking!',
          'Arrange the bottles into your guess (drag, or tap two to swap).',
          'Submit to see how many bottles are in the correct position.',
          'Use that clue to deduce the order — crack it in the fewest attempts to win!',
        ]}
        tip="Only the count is shown, never which ones are right. Short a player? Add a 🤖 bot in the waiting room."
      />
      {roomId && (
        <button onClick={copyRoom} className="flex items-center gap-1.5 bg-hover-bg border border-border-color rounded-full px-2.5 py-1 shrink-0 hover:border-border-hover transition-colors">
          <span className="text-[11px] sm:text-xs font-mono font-semibold text-text-secondary">{roomId}</span>
          <Copy className="w-3 h-3 text-text-muted" />
          {copied && <span className="text-[10px] text-emerald-500">✓</span>}
        </button>
      )}
    </header>
  );

  return (
    <div className="flex flex-col h-full w-full bg-bg-primary">
      {Header}

      {error && (
        <div className="px-4 py-2 bg-red-500/10 border-b border-red-500/20 text-red-500 text-xs text-center">{error}</div>
      )}

      <div className="flex-1 overflow-y-auto flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-xl mx-auto">

          {/* ── LOBBY ── */}
          {phase === 'lobby' && (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="text-center flex flex-col items-center gap-6">
              <div className="flex gap-2 sm:gap-3 flex-wrap justify-center max-w-md">
                {BOTTLES.slice(0, bottleCount).map((b, i) => (
                  <motion.div key={b.key} initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: i * 0.06 }}>
                    <BottleGlass def={b} small />
                  </motion.div>
                ))}
              </div>
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold text-text-primary mb-2">Bottle Shuffle Match</h1>
                <p className="text-sm text-text-secondary max-w-md mx-auto leading-relaxed">
                  {bottleCount} bottles are hidden in a secret order. Guess the order, and each try tells you
                  how many are in the right spot. Crack it in the <b className="text-text-primary">fewest attempts</b> to win!
                </p>
              </div>

              {/* Bottle count selector — only relevant before a room is created. */}
              <div className="flex flex-col items-center gap-2 w-full max-w-xs">
                <span className="text-[10px] font-bold text-text-muted uppercase tracking-wider">Bottles</span>
                <div className="flex gap-2 w-full">
                  {BOTTLE_COUNT_OPTIONS.map(n => (
                    <button
                      key={n}
                      onClick={() => setBottleCount(n)}
                      className={`flex-1 h-10 rounded-xl text-sm font-bold transition-colors border ${
                        bottleCount === n
                          ? 'bg-emerald-500/15 border-emerald-500 text-emerald-300'
                          : 'bg-bg-tertiary border-border-color text-text-secondary hover:bg-hover-bg'
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
                <span className="text-[10px] text-text-muted">
                  {bottleCount === 5 && 'Quick & friendly'}
                  {bottleCount === 7 && 'Tougher memory test'}
                  {bottleCount === 10 && 'For memory champs'}
                </span>
              </div>

              <button onClick={handleCreate} disabled={busy}
                className="w-full max-w-xs px-8 py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-semibold shadow-lg shadow-emerald-500/25 hover:scale-[1.02] active:scale-95 transition-transform flex items-center justify-center gap-2 disabled:opacity-60">
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Crown className="w-4 h-4" />} Create Room
              </button>
              <div className="flex items-center gap-3 w-full max-w-xs">
                <div className="flex-1 h-px bg-border-color" /><span className="text-xs text-text-muted">or join</span><div className="flex-1 h-px bg-border-color" />
              </div>
              <div className="flex gap-2 w-full max-w-xs">
                <input value={roomInput} onChange={e => setRoomInput(e.target.value.toUpperCase())} placeholder="Room code"
                  className="flex-1 h-11 bg-bg-tertiary border border-border-color rounded-xl px-4 text-center font-mono uppercase tracking-wider text-text-primary focus:outline-none focus:border-emerald-500 transition-colors" />
                <button onClick={() => handleJoin()} disabled={busy || !roomInput.trim()}
                  className="px-5 h-11 rounded-xl border border-border-color text-text-secondary hover:bg-hover-bg transition-colors font-medium disabled:opacity-40">Join</button>
              </div>
            </motion.div>
          )}

          {/* ── WAITING ROOM ── */}
          {phase === 'waiting' && state && (
            <div className="flex flex-col items-center gap-6 text-center">
              <div className="flex items-center gap-2 text-text-secondary"><Users className="w-4 h-4" /><span className="text-sm font-medium">Waiting room</span></div>
              <div>
                <p className="text-xs text-text-muted mb-1">Share this code with friends</p>
                <button onClick={copyRoom} className="text-3xl font-mono font-bold tracking-widest text-text-primary hover:text-emerald-500 transition-colors flex items-center gap-2">
                  {roomId} <Copy className="w-5 h-5 text-text-muted" />
                </button>
                {copied && <p className="text-xs text-emerald-500 mt-1">Copied!</p>}
              </div>
              <div className="w-full max-w-sm bg-bg-secondary border border-border-color rounded-xl overflow-hidden">
                {state.players.map(p => (
                  <div key={p.username} className="flex items-center gap-3 px-4 py-3 border-b border-border-color last:border-0">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold ${p.bot ? 'bg-gradient-to-br from-slate-500 to-slate-700' : 'bg-gradient-to-br from-emerald-500 to-teal-600'}`}>
                      {p.bot ? '🤖' : p.username.charAt(0).toUpperCase()}
                    </div>
                    <span className="flex-1 text-left text-sm text-text-primary">{p.username}{p.username === username && ' (you)'}</span>
                    {p.username === state.host && <span className="text-[10px] font-semibold text-yellow-500 flex items-center gap-1"><Crown className="w-3 h-3" /> Host</span>}
                    {p.bot && isHost && (
                      <button onClick={() => handleRemoveBot(p.username)} className="text-text-muted hover:text-red-500 transition-colors" title="Remove bot">
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <p className="text-xs text-text-muted">
                {state.players.length}/{state.maxPlayers} players · {state.bottleCount || state.colors?.length || 5} bottles · need {state.minPlayers}+ to start
              </p>
              {isHost ? (
                <div className="w-full max-w-xs flex flex-col gap-2">
                  <button onClick={handleAddBot} disabled={busy || state.players.length >= state.maxPlayers}
                    className="w-full px-4 py-2.5 rounded-xl border border-border-color text-text-secondary hover:bg-hover-bg transition-colors flex items-center justify-center gap-2 text-sm font-medium disabled:opacity-40">
                    <Bot className="w-4 h-4" /> Add Bot
                  </button>
                  <button onClick={handleStart} disabled={busy || state.players.length < state.minPlayers}
                    className="w-full px-8 py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-semibold shadow-lg shadow-emerald-500/25 hover:scale-[1.02] active:scale-95 transition-transform flex items-center justify-center gap-2 disabled:opacity-50">
                    {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />} Start Game
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-text-muted text-sm"><Loader2 className="w-4 h-4 animate-spin" /> Waiting for host to start…</div>
              )}
            </div>
          )}

          {/* ── PLAY ── */}
          {phase === 'play' && state && (
            <div className="flex flex-col items-center gap-6">
              <div className="text-center">
                <h2 className="text-lg sm:text-xl font-bold text-text-primary mb-1 flex items-center justify-center gap-2">
                  <Shuffle className="w-4 h-4 text-emerald-500" /> Guess the secret order
                </h2>
                <p className="text-xs sm:text-sm text-text-secondary">Arrange the bottles and Submit. You'll see how many are in the right spot — use the clue to crack it!</p>
              </div>

              {iSolved ? (
                <div className="flex flex-col items-center gap-3 py-6">
                  <div className="text-5xl">✅</div>
                  <p className="font-bold text-text-primary">Solved in {myPlayer?.solvedAtAttempt || myPlayer?.attempts} attempt{(myPlayer?.attempts || 0) === 1 ? '' : 's'}!</p>
                  <p className="text-sm text-text-muted flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Waiting for other players…</p>
                </div>
              ) : (
                <>
                  <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                    <SortableContext items={arrangement} strategy={horizontalListSortingStrategy}>
                      <div className="flex gap-1 sm:gap-2 flex-wrap justify-center">
                        {arrangement.map((k, i) => (
                          <PlayBottle key={k} bottleKey={k} index={i} selected={selected === k} onSelect={() => handleSelect(k)} />
                        ))}
                      </div>
                    </SortableContext>
                  </DndContext>

                  <div className="flex items-center gap-4 text-xs text-text-muted">
                    <span>Attempts: <b className="text-text-secondary">{myPlayer?.attempts ?? 0}</b></span>
                    <span>Swaps: <b className="text-text-secondary">{swaps}</b></span>
                    {myLastMatches !== null && (
                      <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 font-semibold">Last: {myLastMatches}/{colors.length} matched</span>
                    )}
                  </div>

                  <button onClick={handleSubmit} disabled={busy}
                    className="px-8 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-semibold shadow-lg shadow-emerald-500/25 hover:scale-[1.03] active:scale-95 transition-transform flex items-center gap-2 text-sm disabled:opacity-60">
                    {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Submit Attempt
                  </button>
                </>
              )}

              {/* Opponents progress (no match details revealed) */}
              <div className="w-full max-w-sm mt-2">
                <p className="text-[11px] uppercase tracking-wider text-text-muted mb-2 text-center">Players</p>
                <div className="flex flex-col gap-1.5">
                  {state.players.map(p => (
                    <div key={p.username} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-bg-secondary border border-border-color">
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold ${p.bot ? 'bg-gradient-to-br from-slate-500 to-slate-700' : 'bg-gradient-to-br from-emerald-500 to-teal-600'}`}>
                        {p.bot ? '🤖' : p.username.charAt(0).toUpperCase()}
                      </div>
                      <span className="flex-1 text-sm text-text-primary truncate">{p.username}{p.username === username && ' (you)'}</span>
                      <span className="text-xs text-text-muted">{p.attempts} {p.attempts === 1 ? 'try' : 'tries'}</span>
                      {p.solved && <span className="text-xs text-emerald-500 font-semibold flex items-center gap-1"><Check className="w-3 h-3" /> Solved</span>}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── FINISHED ── */}
          {phase === 'finished' && state && (
            <AnimatePresence>
              <motion.div initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }} className="flex flex-col items-center gap-6 text-center">
                <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 220, damping: 14 }} className="text-6xl">
                  {state.winner === username ? '🏆' : '🎮'}
                </motion.div>
                <h1 className="text-2xl sm:text-3xl font-bold text-text-primary">
                  {state.winner === username ? 'You win! 🎉' : state.winner ? `${state.winner} wins!` : 'Game over'}
                </h1>

                {/* Final standings — ranked by attempts */}
                <div className="w-full max-w-sm bg-bg-secondary border border-border-color rounded-xl overflow-hidden">
                  {[...state.players]
                    .sort((a, b) => (a.solvedAtAttempt || 99) - (b.solvedAtAttempt || 99) || (a.finishRank || 99) - (b.finishRank || 99))
                    .map((p, i) => (
                      <div key={p.username} className={`flex items-center gap-3 px-4 py-3 border-b border-border-color last:border-0 ${p.username === state.winner ? 'bg-emerald-500/10' : ''}`}>
                        <span className="w-6 text-center text-sm">{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}</span>
                        <span className="flex-1 text-left text-sm text-text-primary truncate">{p.username}{p.username === username && ' (you)'}</span>
                        <span className="text-xs text-text-secondary font-semibold">{p.solvedAtAttempt || p.attempts} {((p.solvedAtAttempt || p.attempts) === 1) ? 'attempt' : 'attempts'}</span>
                        {p.username === state.winner && <Trophy className="w-4 h-4 text-yellow-500" />}
                      </div>
                    ))}
                </div>

                {/* Reveal the answer now that it's over */}
                {state.revealOrder && (
                  <div className="flex flex-col items-center gap-2">
                    <p className="text-[11px] uppercase tracking-wider text-text-muted">The original order was</p>
                    <div className="flex gap-1.5 flex-wrap justify-center max-w-md">
                      {state.revealOrder.map(k => <BottleGlass key={k} def={BY_KEY[k]} small />)}
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-3">
                  <button onClick={handleLeave} className="px-5 py-2.5 rounded-xl border border-border-color text-text-secondary hover:bg-hover-bg transition-colors text-sm font-medium">Exit</button>
                  {isHost && (
                    <button onClick={handleRematch} disabled={busy}
                      className="px-8 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-semibold shadow-lg shadow-emerald-500/25 hover:scale-[1.03] active:scale-95 transition-transform flex items-center gap-2 text-sm disabled:opacity-60">
                      {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />} Rematch
                    </button>
                  )}
                </div>
                {!isHost && <p className="text-xs text-text-muted">Waiting for the host to start a rematch…</p>}
              </motion.div>
            </AnimatePresence>
          )}

        </div>
      </div>

      {/* ── Floating in-game chat (non-intrusive overlay) ── */}
      {roomId && phase !== 'lobby' && (
        <>
          {!chatOpen && (
            <button
              onClick={() => setChatOpen(true)}
              className="fixed bottom-20 right-4 sm:bottom-6 sm:right-6 z-40 w-12 h-12 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-lg shadow-emerald-500/30 flex items-center justify-center hover:scale-105 active:scale-95 transition-transform"
              title="Chat"
            >
              <MessageCircle className="w-5 h-5" />
              {unreadChat > 0 && (
                <span className="absolute -top-1 -right-1 min-w-5 h-5 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">{unreadChat}</span>
              )}
            </button>
          )}

          {chatOpen && (
            <div className="fixed bottom-20 right-4 sm:bottom-6 sm:right-6 z-40 w-[min(20rem,calc(100vw-2rem))] bg-bg-secondary border border-border-color rounded-2xl shadow-2xl flex flex-col overflow-hidden">
              <div className="flex items-center justify-between px-3 py-2 border-b border-border-color bg-bg-tertiary">
                <span className="text-sm font-semibold text-text-primary flex items-center gap-2"><MessageCircle className="w-4 h-4 text-emerald-500" /> Chat</span>
                <button onClick={() => setChatOpen(false)} className="p-1 hover:bg-hover-bg rounded-lg text-text-muted"><X className="w-4 h-4" /></button>
              </div>

              <div className="h-56 overflow-y-auto px-3 py-2 flex flex-col gap-1.5">
                {messages.length === 0 ? (
                  <p className="text-xs text-text-muted text-center my-auto flex items-center justify-center gap-1"><Smile className="w-3.5 h-3.5" /> Say hi or drop an emoji 👋</p>
                ) : messages.map(m => {
                  const mine = m.sender === username;
                  return (
                    <div key={m.id} className={`flex flex-col max-w-[80%] ${mine ? 'self-end items-end' : 'self-start items-start'}`}>
                      {!mine && <span className="text-[10px] text-text-muted px-1 truncate max-w-full">{m.sender}</span>}
                      <span className={`px-2.5 py-1.5 rounded-2xl text-sm break-words ${mine ? 'bg-emerald-500 text-white rounded-br-sm' : 'bg-bg-tertiary text-text-primary rounded-bl-sm'}`}>{m.message}</span>
                    </div>
                  );
                })}
                <div ref={chatEndRef} />
              </div>

              <div className="flex gap-1 px-2 py-1.5 border-t border-border-color overflow-x-auto">
                {QUICK_EMOJI.map(e => (
                  <button key={e} onClick={() => sendChat(e)} className="text-lg hover:scale-125 transition-transform shrink-0">{e}</button>
                ))}
              </div>

              <form onSubmit={(ev) => { ev.preventDefault(); sendChat(chatInput); }} className="flex items-center gap-2 p-2 border-t border-border-color">
                <input
                  value={chatInput}
                  onChange={e => setChatInput(e.target.value)}
                  placeholder="Message…"
                  maxLength={200}
                  className="flex-1 h-9 bg-bg-tertiary border border-border-color rounded-xl px-3 text-sm text-text-primary focus:outline-none focus:border-emerald-500"
                />
                <button type="submit" disabled={!chatInput.trim()} className="w-9 h-9 rounded-xl bg-emerald-500 text-white flex items-center justify-center disabled:opacity-40 shrink-0">
                  <Send className="w-4 h-4" />
                </button>
              </form>
            </div>
          )}
        </>
      )}
    </div>
  );
};
