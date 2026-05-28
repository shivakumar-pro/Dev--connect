import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import type { ReactNode } from 'react';
import { motion, AnimatePresence, LayoutGroup } from 'framer-motion';
import {
  DndContext, DragOverlay, PointerSensor, useSensor, useSensors,
  useDraggable, useDroppable, pointerWithin,
} from '@dnd-kit/core';
import type { DragStartEvent, DragEndEvent } from '@dnd-kit/core';
import {
  ArrowLeft, Users, Bot, Crown, Plus, Play, Copy, Check, Layers, Trash2,
  MessageCircle, Send, X, Sparkles, Ban, Trophy, Clock, ChevronUp, Zap, RotateCcw,
} from 'lucide-react';
import {
  subscribe, phase10Join, phase10Leave, phase10Start, phase10AddBot, phase10RemoveBot,
  phase10Draw, phase10Lay, phase10Hit, phase10Discard, phase10Chat, phase10Rematch,
} from '../../services/stompClient';
import { Phase10API } from '../../services/api';

// ──────────────────────────── Types ────────────────────────────
type CColor = 'RED' | 'BLUE' | 'GREEN' | 'YELLOW' | 'NONE';
type CType = 'NUMBER' | 'WILD' | 'SKIP';
type GType = 'SET' | 'RUN' | 'COLOR';

interface PCard { id: string; type: CType; color: CColor; value: number; }
interface PMeld { id: string; owner: string; type: GType; cards: PCard[]; setValue?: number; color?: CColor; runStart?: number; }
interface PPlayer {
  username: string; bot: boolean; connected: boolean; handCount: number;
  currentPhase: number; phaseDescription: string; phaseCompletedThisRound: boolean;
  totalScore: number; lastRoundScore: number; skipNext: boolean; isHost: boolean; isCurrent: boolean;
}
interface PState {
  roomId: string; status: 'WAITING' | 'PLAYING' | 'ROUND_RESULT' | 'FINISHED';
  hostUsername: string; botsEnabled: boolean; roundNumber: number; maxPlayers: number;
  turnTimerSeconds: number; currentTurn: string | null; turnPhase: 'DRAW' | 'ACTION';
  drawPileCount: number; discardTop: PCard | null; discardCount: number;
  winner: string | null; table: PMeld[]; players: PPlayer[];
}
interface Toast { id: number; text: string; kind: 'info' | 'error' | 'good'; }
interface ChatMsg { sender: string; message: string; }

// Phase requirements (mirrors backend) — drives the lay-down builder.
const PHASE_REQS: { type: GType; count: number }[][] = [
  [{ type: 'SET', count: 3 }, { type: 'SET', count: 3 }],
  [{ type: 'SET', count: 3 }, { type: 'RUN', count: 4 }],
  [{ type: 'SET', count: 4 }, { type: 'RUN', count: 4 }],
  [{ type: 'RUN', count: 7 }],
  [{ type: 'RUN', count: 8 }],
  [{ type: 'RUN', count: 9 }],
  [{ type: 'SET', count: 4 }, { type: 'SET', count: 4 }],
  [{ type: 'COLOR', count: 7 }],
  [{ type: 'SET', count: 5 }, { type: 'SET', count: 2 }],
  [{ type: 'SET', count: 5 }, { type: 'SET', count: 3 }],
];
const PHASE_DESC = [
  '2 sets of 3', '1 set of 3 + 1 run of 4', '1 set of 4 + 1 run of 4', '1 run of 7',
  '1 run of 8', '1 run of 9', '2 sets of 4', '7 cards of one color',
  '1 set of 5 + 1 set of 2', '1 set of 5 + 1 set of 3',
];
const groupLabel = (r: { type: GType; count: number }) =>
  `${r.type === 'SET' ? 'Set' : r.type === 'RUN' ? 'Run' : 'Color'} of ${r.count}`;

// Advisory client-side validation so players see if a group is valid as they build it.
// The server stays the source of truth.
function validateGroup(cards: PCard[], req: { type: GType; count: number }): { ok: boolean; hint: string } {
  const n = cards.length;
  const need = req.count;
  if (n === 0) return { ok: false, hint: `0/${need}` };
  if (cards.some((c) => c.type === 'SKIP')) return { ok: false, hint: 'No skip cards' };
  const wilds = cards.filter((c) => c.type === 'WILD').length;
  const nums = cards.filter((c) => c.type === 'NUMBER');

  if (req.type === 'SET') {
    const vals = new Set(nums.map((c) => c.value));
    if (vals.size > 1) return { ok: false, hint: `Mixed numbers · ${n}/${need}` };
    return { ok: n === need, hint: n === need ? '✓ Set' : `Same number · ${n}/${need}` };
  }
  if (req.type === 'COLOR') {
    const cols = new Set(nums.map((c) => c.color));
    if (cols.size > 1) return { ok: false, hint: `Mixed colors · ${n}/${need}` };
    return { ok: n === need, hint: n === need ? '✓ Color' : `Same color · ${n}/${need}` };
  }
  // RUN — consecutive numbers, wilds fill gaps
  const vals = nums.map((c) => c.value).sort((a, b) => a - b);
  for (let i = 1; i < vals.length; i++) {
    if (vals[i] === vals[i - 1]) return { ok: false, hint: `Run can't repeat ${vals[i]} · ${n}/${need}` };
  }
  if (vals.length >= 2) {
    const span = vals[vals.length - 1] - vals[0] + 1;
    if (span > need) return { ok: false, hint: `Too spread out · ${n}/${need}` };
    let gaps = 0;
    for (let i = 1; i < vals.length; i++) gaps += vals[i] - vals[i - 1] - 1;
    if (gaps > wilds) return { ok: false, hint: `Not consecutive · ${n}/${need}` };
  }
  return { ok: n === need, hint: n === need ? '✓ Run' : `Consecutive · ${n}/${need}` };
}

// ── Drag & drop helpers ──
function DraggableCard({ id, disabled, children }: { id: string; disabled?: boolean; children: ReactNode }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id, disabled });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      style={{ touchAction: 'none', opacity: isDragging ? 0.3 : 1 }}
      className="shrink-0"
    >
      {children}
    </div>
  );
}
function DropZone({ id, disabled, className, overClassName, children }: {
  id: string; disabled?: boolean; className?: string; overClassName?: string; children: ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id, disabled });
  return <div ref={setNodeRef} className={`${className || ''} ${isOver && !disabled ? (overClassName || '') : ''}`}>{children}</div>;
}

// ──────────────────────────── Card visuals ────────────────────────────
// Outer card gradient (the colored border/frame)
const COLOR_BG: Record<CColor, string> = {
  RED: 'from-rose-500 to-red-600',
  BLUE: 'from-sky-500 to-blue-600',
  GREEN: 'from-emerald-500 to-green-600',
  YELLOW: 'from-amber-400 to-yellow-500',
  NONE: 'from-slate-500 to-slate-700',
};
// Number colour shown on the white inner panel
const COLOR_TEXT: Record<CColor, string> = {
  RED: 'text-rose-600',
  BLUE: 'text-blue-600',
  GREEN: 'text-emerald-600',
  YELLOW: 'text-amber-500',
  NONE: 'text-slate-600',
};
const WILD_BG = 'from-fuchsia-500 via-purple-500 to-indigo-500';
const SKIP_BG = 'from-slate-600 to-slate-800';

function cardSizeClasses(size: 'sm' | 'md' | 'lg') {
  if (size === 'sm') return 'w-10 h-[58px] rounded-md';
  if (size === 'lg') return 'w-[78px] h-[112px] sm:w-[88px] sm:h-[126px] rounded-2xl';
  return 'w-[54px] h-[80px] sm:w-16 sm:h-[94px] rounded-xl';
}
function numTextClass(size: 'sm' | 'md' | 'lg') {
  if (size === 'sm') return 'text-xl';
  if (size === 'lg') return 'text-5xl';
  return 'text-3xl sm:text-4xl';
}
function cornerTextClass(size: 'sm' | 'md' | 'lg') {
  if (size === 'sm') return 'text-[9px]';
  if (size === 'lg') return 'text-sm';
  return 'text-[11px]';
}

function PlayingCard({
  card, size = 'md', faceUp = true, selected, onClick, dim, badge, draggableHint,
}: {
  card: PCard; size?: 'sm' | 'md' | 'lg'; faceUp?: boolean; selected?: boolean;
  onClick?: () => void; dim?: boolean; badge?: string; draggableHint?: boolean;
}) {
  const isNum = card.type === 'NUMBER';
  const gradient = card.type === 'WILD' ? WILD_BG : card.type === 'SKIP' ? SKIP_BG : COLOR_BG[card.color];
  const numColor = COLOR_TEXT[card.color] || 'text-slate-700';
  const pad = size === 'lg' ? 'p-[5px]' : size === 'sm' ? 'p-[3px]' : 'p-1';
  const innerRadius = size === 'lg' ? 'rounded-[12px]' : size === 'sm' ? 'rounded-[5px]' : 'rounded-[9px]';

  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      className={`relative shrink-0 ${cardSizeClasses(size)} ${pad} bg-gradient-to-br ${gradient}
        shadow-lg select-none overflow-hidden transition-transform duration-150
        ${dim ? 'opacity-45' : ''}
        ${selected ? 'ring-[3px] ring-white shadow-white/30 -translate-y-3' : 'ring-1 ring-black/25'}
        ${onClick ? 'cursor-pointer hover:-translate-y-1.5 active:scale-95' : 'cursor-default'}
        ${draggableHint ? 'ring-2 ring-white/50' : ''}`}
      style={{ WebkitTapHighlightColor: 'transparent' }}
    >
      {!faceUp ? (
        <div className="absolute inset-0 rounded-[inherit] bg-gradient-to-br from-indigo-700 via-purple-700 to-fuchsia-700 flex items-center justify-center">
          <div className="absolute inset-1.5 rounded-[inherit] border-2 border-white/20" />
          <Layers className="w-1/3 h-1/3 text-white/70" />
        </div>
      ) : (
        <div className={`relative w-full h-full ${innerRadius} bg-white flex items-center justify-center`}>
          {/* glossy top sheen */}
          <div className={`absolute inset-x-0 top-0 h-1/2 ${innerRadius} bg-gradient-to-b from-black/[0.03] to-transparent`} />
          {isNum ? (
            <>
              <span className={`absolute top-0.5 left-1 leading-none font-extrabold ${cornerTextClass(size)} ${numColor}`}>{card.value}</span>
              <span className={`font-black ${numTextClass(size)} ${numColor} drop-shadow-sm`}>{card.value}</span>
              <span className={`absolute bottom-0.5 right-1 leading-none font-extrabold rotate-180 ${cornerTextClass(size)} ${numColor}`}>{card.value}</span>
            </>
          ) : card.type === 'WILD' ? (
            <div className="flex flex-col items-center">
              <Sparkles className={`${size === 'lg' ? 'w-9 h-9' : size === 'sm' ? 'w-5 h-5' : 'w-7 h-7'} text-fuchsia-600`} />
              <span className={`font-black tracking-tight text-fuchsia-600 ${size === 'sm' ? 'text-[8px]' : 'text-[10px]'}`}>WILD</span>
            </div>
          ) : (
            <div className="flex flex-col items-center">
              <Ban className={`${size === 'lg' ? 'w-9 h-9' : size === 'sm' ? 'w-5 h-5' : 'w-7 h-7'} text-slate-700`} />
              <span className={`font-black tracking-tight text-slate-700 ${size === 'sm' ? 'text-[8px]' : 'text-[10px]'}`}>SKIP</span>
            </div>
          )}
        </div>
      )}
      {badge && (
        <span className="absolute -top-1.5 -right-1.5 z-10 text-[9px] font-bold bg-white text-bg-primary rounded-full px-1.5 py-0.5 shadow border border-black/10">
          {badge}
        </span>
      )}
    </button>
  );
}

function CardBackStack({ count, size = 'md' }: { count: number; size?: 'sm' | 'md' | 'lg' }) {
  const layers = Math.min(4, Math.max(1, Math.ceil(count / 12)));
  return (
    <div className="relative">
      {Array.from({ length: layers }).map((_, i) => (
        <div
          key={i}
          className={`${cardSizeClasses(size)} bg-gradient-to-br from-bg-tertiary to-bg-secondary border border-border-color absolute`}
          style={{ top: -i * 2, left: -i * 2 }}
        />
      ))}
      <div className={`${cardSizeClasses(size)} relative bg-gradient-to-br from-indigo-600 via-purple-600 to-fuchsia-600 border border-black/20 flex items-center justify-center shadow-lg`}>
        <Layers className="w-1/3 h-1/3 text-white/80" />
      </div>
    </div>
  );
}

// ──────────────────────────── Main component ────────────────────────────
export const Phase10 = ({ currentUser, onBack, initialRoomId }: {
  currentUser: any; onBack: () => void; initialRoomId?: string;
}) => {
  const myName: string = currentUser?.username;

  const [screen, setScreen] = useState<'menu' | 'connecting' | 'room'>(initialRoomId ? 'connecting' : 'menu');
  const [roomId, setRoomId] = useState<string>(initialRoomId || '');
  const [joinCode, setJoinCode] = useState('');
  const [creating, setCreating] = useState(false);
  const [menuError, setMenuError] = useState('');

  // create options
  const [optMaxPlayers, setOptMaxPlayers] = useState(4);
  const [optTimer, setOptTimer] = useState(45);
  const [optBots, setOptBots] = useState(true);

  // live game state
  const [state, setState] = useState<PState | null>(null);
  const [hand, setHand] = useState<PCard[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [roundResult, setRoundResult] = useState<any | null>(null);
  const [gameOver, setGameOver] = useState<{ winner: string | null; standings: any[] } | null>(null);

  // turn timer
  const [now, setNow] = useState(Date.now());
  const deadlineRef = useRef<number>(0);

  // action UI
  const [mode, setMode] = useState<'idle' | 'lay' | 'hit'>('idle');
  const [selected, setSelected] = useState<string[]>([]);
  const [layGroups, setLayGroups] = useState<string[][]>([]);
  const [skipModal, setSkipModal] = useState<string | null>(null); // cardId pending skip target
  const [busy, setBusy] = useState(false); // optimistic lock during my action

  // chat
  const [chatOpen, setChatOpen] = useState(false);
  const [chat, setChat] = useState<ChatMsg[]>([]);
  const [chatInput, setChatInput] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);

  const toastId = useRef(0);
  const pushToast = useCallback((text: string, kind: Toast['kind'] = 'info') => {
    const id = ++toastId.current;
    setToasts((t) => [...t, { id, text, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2600);
  }, []);

  // 1s ticker for the turn timer
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [chat]);

  // ──────── Subscriptions ────────
  useEffect(() => {
    if (!roomId) return;
    let cancelled = false;
    const subs: any[] = [];

    const onEvent = (msg: any) => {
      if (cancelled) return;
      if (msg.roomId && msg.roomId !== roomId) return;
      switch (msg.type) {
        case 'STATE':
          if (msg.state) {
            setState(msg.state as PState);
            setScreen('room');
          }
          break;
        case 'HAND':
          setHand(sortHand(msg.hand || []));
          setBusy(false);
          break;
        case 'TURN_START':
          deadlineRef.current = Date.now() + (msg.turnTimerSeconds || 45) * 1000;
          if (msg.currentTurn === myName) pushToast('Your turn!', 'good');
          setMode('idle'); setSelected([]); setLayGroups([]);
          break;
        case 'CARD_DRAWN':
          if (msg.player !== myName) pushToast(`${disp(msg.player)} drew from ${msg.source === 'DISCARD' ? 'discard' : 'the deck'}`);
          break;
        case 'PHASE_LAID':
          pushToast(`${disp(msg.player)} laid their phase!`, msg.player === myName ? 'good' : 'info');
          break;
        case 'HIT':
          if (msg.player !== myName) pushToast(`${disp(msg.player)} hit a meld`);
          break;
        case 'CARD_DISCARDED':
          break;
        case 'SKIP_APPLIED':
          if (msg.target === myName) pushToast('You got skipped! ⛔', 'error');
          else if (msg.message) pushToast(msg.message);
          break;
        case 'PLAYER_JOINED':
        case 'PLAYER_LEFT':
        case 'BOT_ADDED':
          if (msg.message) pushToast(msg.message);
          break;
        case 'ROUND_RESULT':
          setRoundResult({ standings: msg.standings, out: msg.player });
          break;
        case 'GAME_OVER':
          setRoundResult(null);
          setGameOver({ winner: msg.winner, standings: msg.standings || [] });
          break;
        case 'REMATCH_REQUEST':
          if (msg.message) pushToast(msg.message);
          break;
        case 'REMATCH_ACCEPTED':
          setGameOver(null); setRoundResult(null);
          pushToast('Rematch! Host can start again.', 'good');
          break;
        case 'CHAT_MESSAGE':
          setChat((c) => [...c, { sender: msg.sender, message: msg.message }]);
          break;
        case 'ERROR':
          pushToast(msg.message || 'Something went wrong', 'error');
          setBusy(false);
          break;
      }
    };

    subscribe(`/topic/phase10/${roomId}`, onEvent).then((s) => subs.push(s));
    subscribe(`/user/queue/phase10`, onEvent).then((s) => subs.push(s));

    // join after a tick so subscriptions are registered
    const jt = setTimeout(() => phase10Join(roomId), 350);

    return () => {
      cancelled = true;
      clearTimeout(jt);
      subs.forEach((s) => s?.unsubscribe());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  const disp = (name: string | null | undefined) => (name === myName ? 'You' : name || '');

  // ──────── Create / Join ────────
  const handleCreate = async () => {
    setCreating(true); setMenuError('');
    try {
      const res = await Phase10API.createRoom({ maxPlayers: optMaxPlayers, turnTimerSeconds: optTimer, botsEnabled: optBots });
      const data = res.data || res;
      setRoomId(data.roomId);
      setScreen('connecting');
    } catch {
      setMenuError('Could not create room. Is the server awake?');
    } finally {
      setCreating(false);
    }
  };
  const handleJoin = () => {
    const code = joinCode.trim().toUpperCase();
    if (!code) return;
    setRoomId(code);
    setScreen('connecting');
  };
  const leave = () => {
    if (roomId) phase10Leave(roomId);
    onBack();
  };

  // ──────── Derived ────────
  const me = state?.players.find((p) => p.username === myName);
  const isMyTurn = state?.currentTurn === myName && state?.status === 'PLAYING';
  const myPhase = me?.currentPhase || 1;
  const reqs = PHASE_REQS[myPhase - 1] || [];
  const opponents = useMemo(() => (state?.players || []).filter((p) => p.username !== myName), [state, myName]);
  const timeLeft = Math.max(0, Math.ceil((deadlineRef.current - now) / 1000));
  const timerPct = state ? Math.max(0, Math.min(100, (timeLeft / state.turnTimerSeconds) * 100)) : 0;

  const usedInGroups = new Set(layGroups.flat());
  const availableHand = hand.filter((c) => !usedInGroups.has(c.id));

  // ──────── Actions ────────
  const draw = (fromDiscard: boolean) => {
    if (!isMyTurn || state?.turnPhase !== 'DRAW' || busy) return;
    setBusy(true);
    phase10Draw(roomId, fromDiscard);
  };

  const toggleSelect = (id: string) => {
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  };

  const enterLayMode = () => {
    setMode('lay'); setSelected([]); setLayGroups(reqs.map(() => []));
  };
  const assignToGroup = (gi: number) => {
    if (selected.length === 0) return;
    setLayGroups((groups) => groups.map((g, i) => (i === gi ? [...g, ...selected.filter((s) => !g.includes(s))] : g)));
    setSelected([]);
  };
  const removeFromGroup = (gi: number, id: string) => {
    setLayGroups((groups) => groups.map((g, i) => (i === gi ? g.filter((x) => x !== id) : g)));
  };
  const groupCards = (gi: number): PCard[] => (layGroups[gi] || []).map((id) => hand.find((c) => c.id === id)).filter(Boolean) as PCard[];
  const groupChecks = reqs.map((r, i) => validateGroup(groupCards(i), r));
  const layReady = layGroups.length === reqs.length && groupChecks.every((c) => c.ok);
  const submitLay = () => {
    if (!layReady || busy) return;
    setBusy(true);
    phase10Lay(roomId, layGroups);
    // optimistic: drop laid cards from hand
    const laid = new Set(layGroups.flat());
    setHand((h) => h.filter((c) => !laid.has(c.id)));
    setMode('idle'); setSelected([]); setLayGroups([]);
  };

  const enterHitMode = () => { setMode('hit'); setSelected([]); };
  const hitMeld = (meldId: string) => {
    if (selected.length !== 1) { pushToast('Pick exactly one card to hit', 'info'); return; }
    const cardId = selected[0];
    const card = hand.find((c) => c.id === cardId);
    const runEnd = card?.type === 'WILD' ? 'HIGH' : undefined;
    phase10Hit(roomId, meldId, cardId, runEnd);
    setHand((h) => h.filter((c) => c.id !== cardId)); // optimistic
    setSelected([]);
  };

  const tryDiscard = () => {
    if (selected.length !== 1) { pushToast('Select one card to discard', 'info'); return; }
    const card = hand.find((c) => c.id === selected[0]);
    if (!card) return;
    if (card.type === 'SKIP') { setSkipModal(card.id); return; }
    doDiscard(card.id);
  };
  const doDiscard = (cardId: string, skipTarget?: string) => {
    setBusy(true);
    phase10Discard(roomId, cardId, skipTarget);
    setHand((h) => h.filter((c) => c.id !== cardId)); // optimistic
    setSelected([]); setMode('idle'); setSkipModal(null);
  };

  const sendChat = () => {
    const m = chatInput.trim();
    if (!m) return;
    phase10Chat(roomId, m); setChatInput('');
  };

  // ──────── Drag & drop ────────
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));
  const [dragId, setDragId] = useState<string | null>(null);
  const cardById = (id: string | null): PCard | null =>
    !id ? null : id === 'discard-top' ? (state?.discardTop || null) : (hand.find((c) => c.id === id) || null);

  const onDragStart = (e: DragStartEvent) => setDragId(String(e.active.id));
  const onDragEnd = (e: DragEndEvent) => {
    const activeId = String(e.active.id);
    const overId = e.over ? String(e.over.id) : null;
    setDragId(null);
    if (!overId || !state) return;

    // Take the discard card (draw from discard)
    if (activeId === 'discard-top') {
      if (isMyTurn && state.turnPhase === 'DRAW' && state.discardTop && state.discardTop.type !== 'SKIP' && !busy) draw(true);
      return;
    }

    // Move a card into a lay-builder group
    if (overId.startsWith('group-')) {
      const gi = Number(overId.slice(6));
      setLayGroups((groups) => groups.map((g, i) => (i === gi ? Array.from(new Set([...g, activeId])) : g.filter((x) => x !== activeId))));
      return;
    }
    // Return a card from a group back to the hand
    if (overId === 'hand') {
      setLayGroups((groups) => groups.map((g) => g.filter((x) => x !== activeId)));
      return;
    }
    // Discard by dropping on the discard pile
    if (overId === 'discard') {
      if (!isMyTurn || state.turnPhase !== 'ACTION' || busy) return;
      const card = hand.find((c) => c.id === activeId);
      if (!card) return;
      if (card.type === 'SKIP') setSkipModal(card.id);
      else doDiscard(activeId);
      return;
    }
    // Hit a meld by dropping a card on it
    if (overId.startsWith('meld-')) {
      if (!isMyTurn || state.turnPhase !== 'ACTION' || !me?.phaseCompletedThisRound || busy) return;
      const meldId = overId.slice(5);
      const card = hand.find((c) => c.id === activeId);
      if (!card) return;
      const runEnd = card.type === 'WILD' ? 'HIGH' : undefined;
      phase10Hit(roomId, meldId, activeId, runEnd);
      setHand((h) => h.filter((c) => c.id !== activeId));
      return;
    }
  };

  // ════════════════════════════ RENDER ════════════════════════════
  if (screen === 'menu') {
    return (
      <MenuScreen
        onBack={onBack} creating={creating} menuError={menuError}
        optMaxPlayers={optMaxPlayers} setOptMaxPlayers={setOptMaxPlayers}
        optTimer={optTimer} setOptTimer={setOptTimer}
        optBots={optBots} setOptBots={setOptBots}
        joinCode={joinCode} setJoinCode={setJoinCode}
        onCreate={handleCreate} onJoin={handleJoin}
      />
    );
  }

  if (screen === 'connecting' || !state) {
    return (
      <div className="flex flex-col items-center justify-center h-full w-full bg-bg-primary gap-4">
        <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1.2, ease: 'linear' }}>
          <Layers className="w-10 h-10 text-accent-purple" />
        </motion.div>
        <p className="text-text-secondary text-sm">Joining room <span className="font-mono text-accent-purple">{roomId}</span>…</p>
        <button onClick={leave} className="text-xs text-text-muted hover:text-text-primary mt-2">Cancel</button>
      </div>
    );
  }

  // ──────── LOBBY ────────
  if (state.status === 'WAITING') {
    const isHost = state.hostUsername === myName;
    return (
      <div className="flex flex-col h-full w-full bg-bg-primary pb-16 lg:pb-0">
        <TopBar roomId={roomId} onLeave={leave} onChat={() => setChatOpen(true)} subtitle="Lobby" />
        <div className="flex-1 overflow-y-auto px-4 py-6 max-w-2xl mx-auto w-full">
          <div className="text-center mb-6">
            <div className="inline-flex items-center gap-2 bg-bg-secondary border border-border-color rounded-full px-4 py-2">
              <span className="text-xs text-text-muted">Room code</span>
              <span className="font-mono font-bold text-lg text-accent-purple tracking-widest">{roomId}</span>
              <CopyBtn text={roomId} />
            </div>
            <p className="text-xs text-text-muted mt-2">Share this code so friends can join</p>
          </div>

          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-text-primary flex items-center gap-2">
              <Users className="w-4 h-4 text-accent-purple" /> Players ({state.players.length}/{state.maxPlayers})
            </h3>
            {isHost && state.botsEnabled && state.players.length < state.maxPlayers && (
              <button onClick={() => phase10AddBot(roomId)} className="text-xs flex items-center gap-1 bg-accent-purple/10 text-accent-purple px-3 py-1.5 rounded-lg hover:bg-accent-purple/20">
                <Plus className="w-3.5 h-3.5" /> Add bot
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-8">
            {state.players.map((p) => (
              <motion.div key={p.username} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-3 bg-bg-secondary border border-border-color rounded-xl px-3 py-2.5">
                <div className={`w-9 h-9 rounded-full flex items-center justify-center text-white font-bold ${p.bot ? 'bg-slate-600' : 'bg-gradient-to-br from-accent-purple to-accent-hover'}`}>
                  {p.bot ? <Bot className="w-4 h-4" /> : p.username.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-sm text-text-primary truncate flex items-center gap-1">
                    {disp(p.username)}
                    {p.username === state.hostUsername && <Crown className="w-3.5 h-3.5 text-yellow-500" />}
                  </p>
                  <p className="text-[11px] text-text-muted">{p.bot ? 'Bot' : 'Player'}</p>
                </div>
                {isHost && p.bot && (
                  <button onClick={() => phase10RemoveBot(roomId, p.username)} className="text-text-muted hover:text-red-400">
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </motion.div>
            ))}
          </div>

          {isHost ? (
            <button
              onClick={() => phase10Start(roomId)}
              disabled={state.players.length < 2}
              className="w-full h-14 rounded-xl bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white font-bold text-lg flex items-center justify-center gap-2 disabled:opacity-40 shadow-lg shadow-fuchsia-500/20"
            >
              <Play className="w-5 h-5" /> {state.players.length < 2 ? 'Need 2+ players' : 'Start Game'}
            </button>
          ) : (
            <div className="text-center text-text-secondary text-sm py-4">Waiting for host to start…</div>
          )}
        </div>
        <ChatPanel open={chatOpen} onClose={() => setChatOpen(false)} chat={chat} input={chatInput} setInput={setChatInput} onSend={sendChat} myName={myName} endRef={chatEndRef} />
        <Toasts toasts={toasts} />
      </div>
    );
  }

  // ──────── GAME TABLE ────────
  return (
    <LayoutGroup>
    <DndContext sensors={sensors} collisionDetection={pointerWithin} onDragStart={onDragStart} onDragEnd={onDragEnd}>
      <div className="flex flex-col h-full w-full bg-bg-primary overflow-hidden pb-16 lg:pb-0">
        <TopBar roomId={roomId} onLeave={leave} onChat={() => setChatOpen(true)}
          subtitle={`Round ${state.roundNumber}`} />

        {/* Opponents */}
        <div className="flex items-start justify-center gap-2 sm:gap-3 px-2 py-3 overflow-x-auto shrink-0">
          {opponents.map((p) => (
            <OpponentSeat key={p.username} p={p} isTurn={p.username === state.currentTurn} timerPct={p.username === state.currentTurn ? timerPct : 0} />
          ))}
        </div>

        {/* Table center: piles + melds */}
        <div className="flex-1 min-h-0 overflow-y-auto px-3 pb-2">
          <div className="flex items-center justify-center gap-6 sm:gap-10 py-3">
            {/* Draw pile */}
            <div className="flex flex-col items-center gap-1.5">
              <button
                onClick={() => draw(false)}
                disabled={!isMyTurn || state.turnPhase !== 'DRAW' || busy}
                className={`transition-transform ${isMyTurn && state.turnPhase === 'DRAW' ? 'hover:-translate-y-1 cursor-pointer animate-pulse' : 'opacity-90 cursor-default'}`}
              >
                <CardBackStack count={state.drawPileCount} size="lg" />
              </button>
              <span className="text-[10px] text-text-muted">Deck · {state.drawPileCount}</span>
            </div>

            {/* Discard pile — drop a card here to discard; drag the top card to take it */}
            <DropZone id="discard" disabled={!(isMyTurn && state.turnPhase === 'ACTION' && !busy)}
              className="flex flex-col items-center gap-1.5 rounded-2xl p-1 transition-colors"
              overClassName="ring-2 ring-rose-400 bg-rose-400/15">
              <button
                onClick={() => draw(true)}
                disabled={!isMyTurn || state.turnPhase !== 'DRAW' || busy || !state.discardTop || state.discardTop.type === 'SKIP'}
                className={`transition-transform ${isMyTurn && state.turnPhase === 'DRAW' && state.discardTop && state.discardTop.type !== 'SKIP' ? 'hover:-translate-y-1 cursor-pointer' : 'cursor-default'}`}
              >
                <AnimatePresence mode="popLayout">
                  {state.discardTop ? (
                    <DraggableCard id="discard-top" disabled={!(isMyTurn && state.turnPhase === 'DRAW' && state.discardTop.type !== 'SKIP' && !busy)}>
                      <PlayingCard key={state.discardTop.id} card={state.discardTop} size="lg" />
                    </DraggableCard>
                  ) : (
                    <div className={`${cardSizeClasses('lg')} border-2 border-dashed border-border-color flex items-center justify-center text-text-muted text-xs`}>empty</div>
                  )}
                </AnimatePresence>
              </button>
              <span className="text-[10px] text-text-muted">
                {isMyTurn && state.turnPhase === 'ACTION' ? 'Drop to discard' : `Discard${state.discardTop?.type === 'SKIP' ? ' · skip!' : ''}`}
              </span>
            </DropZone>
          </div>

          {/* Laid melds */}
          <div className="mt-1">
            <div className="text-[11px] uppercase tracking-wider text-text-muted mb-2 text-center">
              {state.table.length === 0 ? 'No phases laid yet'
                : 'On the table' + (me?.phaseCompletedThisRound && isMyTurn && state.turnPhase === 'ACTION' ? ' — drag a card onto a meld to add it' : '')}
            </div>
            <div className="flex flex-wrap justify-center gap-2.5">
              {state.table.map((meld) => {
                const canHit = me?.phaseCompletedThisRound && isMyTurn && state.turnPhase === 'ACTION';
                return (
                  <DropZone key={meld.id} id={`meld-${meld.id}`} disabled={!canHit}
                    className="rounded-lg transition-colors" overClassName="ring-2 ring-amber-400 bg-amber-400/10">
                    <MeldView meld={meld} myName={myName} hittable={(mode === 'hit' && selected.length === 1) || !!canHit}
                      onHit={() => hitMeld(meld.id)} />
                  </DropZone>
                );
              })}
            </div>
          </div>
        </div>

        {/* My phase objective + turn banner */}
        <div className="shrink-0 px-3">
          <div className={`rounded-xl px-3 py-2 mb-2 flex items-center justify-between gap-2 border ${isMyTurn ? 'border-accent-purple bg-accent-purple/5' : 'border-border-color bg-bg-secondary'}`}>
            <div className="min-w-0">
              <p className="text-[11px] text-text-muted">Your Phase {myPhase}{me?.phaseCompletedThisRound ? ' · ✅ laid' : ''}</p>
              <p className="text-sm font-bold text-text-primary truncate">{PHASE_DESC[myPhase - 1]}</p>
            </div>
            <div className="text-right shrink-0">
              {isMyTurn ? (
                <span className="text-xs font-bold text-accent-purple flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" /> {timeLeft}s · {state.turnPhase === 'DRAW' ? 'Draw' : 'Play'}
                </span>
              ) : (
                <span className="text-xs text-text-muted">{disp(state.currentTurn)}'s turn</span>
              )}
              <p className="text-[10px] text-text-muted">Score {me?.totalScore ?? 0}</p>
            </div>
          </div>
        </div>

        {/* Lay-down builder */}
        <AnimatePresence>
          {mode === 'lay' && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
              className="shrink-0 px-3 overflow-hidden">
              <div className="bg-bg-secondary border border-accent-purple/40 rounded-xl p-2.5 mb-2">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-text-primary">Build Phase {myPhase}</span>
                  <button onClick={() => { setMode('idle'); setLayGroups([]); setSelected([]); }} className="text-text-muted hover:text-text-primary"><X className="w-4 h-4" /></button>
                </div>
                <p className="text-[10px] text-text-muted mb-2">Drag cards from your hand into a box (or tap to select, then tap a box). Drag a card back to your hand to remove it.</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {reqs.map((r, gi) => {
                    const check = groupChecks[gi];
                    const filled = layGroups[gi]?.length || 0;
                    const ok = check.ok;
                    return (
                      <DropZone key={gi} id={`group-${gi}`}
                        className={`rounded-lg border p-2 min-h-[72px] transition-colors ${ok ? 'border-emerald-500/60 bg-emerald-500/10' : filled ? 'border-amber-500/50 bg-amber-500/5' : 'border-dashed border-border-color bg-bg-tertiary'}`}
                        overClassName="ring-2 ring-accent-purple">
                        <div onClick={() => assignToGroup(gi)} className={`cursor-pointer ${selected.length ? '' : ''}`}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[11px] font-semibold text-text-secondary">{groupLabel(r)}</span>
                            <span className={`text-[10px] font-medium ${ok ? 'text-emerald-400' : filled ? 'text-amber-400' : 'text-text-muted'}`}>{check.hint}</span>
                          </div>
                          <div className="flex gap-1 flex-wrap min-h-[58px] items-center">
                            {(layGroups[gi] || []).map((id) => {
                              const c = hand.find((x) => x.id === id);
                              return c ? (
                                <DraggableCard key={id} id={id}>
                                  <PlayingCard card={c} size="sm" onClick={() => removeFromGroup(gi, id)} />
                                </DraggableCard>
                              ) : null;
                            })}
                            {filled === 0 && <span className="text-[10px] text-text-muted py-1">Drag cards here</span>}
                          </div>
                        </div>
                      </DropZone>
                    );
                  })}
                </div>
                <button onClick={submitLay} disabled={!layReady}
                  className="w-full mt-2 h-10 rounded-lg bg-gradient-to-r from-emerald-500 to-green-600 text-white font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed">
                  <ChevronUp className="w-4 h-4" /> {layReady ? 'Lay Down Phase' : 'Complete all boxes to lay'}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* My hand */}
        <DropZone id="hand" className="shrink-0 bg-bg-secondary/60 border-t border-border-color px-2 pt-2 pb-3 transition-colors" overClassName="bg-accent-purple/5">
          <div className="flex items-end justify-center gap-1 sm:gap-1.5 overflow-x-auto min-h-[92px] pb-1">
            <AnimatePresence mode="popLayout">
              {(mode === 'lay' ? availableHand : hand).map((c) => (
                <DraggableCard key={c.id} id={c.id} disabled={!isMyTurn || state.turnPhase === 'DRAW'}>
                  <PlayingCard
                    card={c} size="md"
                    selected={selected.includes(c.id)}
                    onClick={() => {
                      if (!isMyTurn) { pushToast("Wait for your turn", 'info'); return; }
                      if (state.turnPhase === 'DRAW') { pushToast('Draw a card first', 'info'); return; }
                      if (mode === 'hit') { setSelected([c.id]); return; }
                      toggleSelect(c.id);
                    }}
                  />
                </DraggableCard>
              ))}
            </AnimatePresence>
            {hand.length === 0 && <span className="text-xs text-text-muted py-6">No cards</span>}
          </div>

          {/* Action bar */}
          <div className="flex items-center justify-center gap-2 mt-1.5 flex-wrap">
            {!isMyTurn && <span className="text-xs text-text-muted">Waiting for {disp(state.currentTurn)}…</span>}
            {isMyTurn && state.turnPhase === 'DRAW' && (
              <span className="text-xs text-accent-purple font-semibold animate-pulse">Tap the deck or discard to draw</span>
            )}
            {isMyTurn && state.turnPhase === 'ACTION' && mode === 'idle' && (
              <>
                {!me?.phaseCompletedThisRound && (
                  <ActionBtn onClick={enterLayMode} icon={<Layers className="w-4 h-4" />} label="Lay Phase" tone="purple" />
                )}
                {me?.phaseCompletedThisRound && state.table.length > 0 && (
                  <ActionBtn onClick={enterHitMode} icon={<Zap className="w-4 h-4" />} label="Hit" tone="amber" />
                )}
                <ActionBtn onClick={tryDiscard} icon={<Trash2 className="w-4 h-4" />} label={`Discard${selected.length === 1 ? '' : ' (pick 1)'}`} tone="slate" disabled={selected.length !== 1} />
              </>
            )}
            {isMyTurn && mode === 'hit' && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-amber-400">Pick a card, then tap a meld</span>
                <ActionBtn onClick={() => { setMode('idle'); setSelected([]); }} icon={<X className="w-4 h-4" />} label="Done" tone="slate" />
              </div>
            )}
          </div>
        </DropZone>

        <ChatPanel open={chatOpen} onClose={() => setChatOpen(false)} chat={chat} input={chatInput} setInput={setChatInput} onSend={sendChat} myName={myName} endRef={chatEndRef} />
        <Toasts toasts={toasts} />

        {/* Skip target modal */}
        <AnimatePresence>
          {skipModal && (
            <Overlay onClose={() => setSkipModal(null)}>
              <h3 className="font-bold text-text-primary mb-1 flex items-center gap-2"><Ban className="w-5 h-5 text-rose-500" /> Skip a player</h3>
              <p className="text-xs text-text-muted mb-4">They'll lose their next turn 😈</p>
              <div className="flex flex-col gap-2">
                {opponents.map((p) => (
                  <button key={p.username} onClick={() => doDiscard(skipModal, p.username)}
                    disabled={p.skipNext}
                    className="flex items-center gap-3 bg-bg-tertiary border border-border-color rounded-lg px-3 py-2.5 hover:border-rose-500/50 disabled:opacity-40">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold ${p.bot ? 'bg-slate-600' : 'bg-gradient-to-br from-accent-purple to-accent-hover'}`}>
                      {p.bot ? <Bot className="w-4 h-4" /> : p.username.charAt(0).toUpperCase()}
                    </div>
                    <span className="text-sm text-text-primary flex-1 text-left">{p.username}</span>
                    <span className="text-[10px] text-text-muted">Phase {p.currentPhase}{p.skipNext ? ' · already skipped' : ''}</span>
                  </button>
                ))}
              </div>
              <button onClick={() => setSkipModal(null)} className="w-full mt-3 text-xs text-text-muted hover:text-text-primary">Cancel</button>
            </Overlay>
          )}
        </AnimatePresence>

        {/* Round result */}
        <AnimatePresence>
          {roundResult && !gameOver && (
            <Overlay onClose={() => setRoundResult(null)}>
              <h3 className="text-center font-bold text-lg text-text-primary mb-1">Round Over</h3>
              <p className="text-center text-xs text-text-muted mb-4">{disp(roundResult.out)} went out</p>
              <div className="flex flex-col gap-1.5 max-h-72 overflow-y-auto">
                {(roundResult.standings || []).map((s: any) => (
                  <div key={s.username} className="flex items-center gap-2 bg-bg-tertiary rounded-lg px-3 py-2">
                    <span className="text-sm font-semibold text-text-primary flex-1 truncate">{disp(s.username)}</span>
                    {s.completed ? <span className="text-[10px] text-emerald-400 font-bold">→ Phase {s.phaseAfter}</span>
                      : <span className="text-[10px] text-rose-400">stays on {s.phaseBefore}</span>}
                    <span className="text-xs text-text-muted">+{s.roundScore}</span>
                    <span className="text-xs font-bold text-text-primary w-10 text-right">{s.totalScore}</span>
                  </div>
                ))}
              </div>
              <p className="text-center text-[11px] text-text-muted mt-3">Next round starting…</p>
            </Overlay>
          )}
        </AnimatePresence>

        {/* Game over */}
        <AnimatePresence>
          {gameOver && (
            <Overlay>
              <div className="text-center">
                <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 300 }}>
                  <Trophy className="w-14 h-14 text-yellow-500 mx-auto mb-2" />
                </motion.div>
                <h3 className="font-extrabold text-2xl text-text-primary mb-1">
                  {gameOver.winner ? `${disp(gameOver.winner)} ${gameOver.winner === myName ? 'win!' : 'wins!'}` : 'Game Over'}
                </h3>
                <p className="text-xs text-text-muted mb-4">Final standings</p>
              </div>
              <div className="flex flex-col gap-1.5 max-h-64 overflow-y-auto">
                {gameOver.standings.map((s: any, i: number) => (
                  <div key={s.username} className={`flex items-center gap-2 rounded-lg px-3 py-2 ${i === 0 ? 'bg-yellow-500/10 border border-yellow-500/30' : 'bg-bg-tertiary'}`}>
                    <span className="w-6 text-center">{['🥇', '🥈', '🥉'][i] || i + 1}</span>
                    <span className="text-sm font-semibold text-text-primary flex-1 truncate">{disp(s.username)}</span>
                    <span className="text-[10px] text-text-muted">{s.finishedAll ? 'Finished!' : `Phase ${s.phase}`}</span>
                    <span className="text-xs font-bold text-text-primary w-10 text-right">{s.score}</span>
                  </div>
                ))}
              </div>
              <div className="flex gap-2 mt-4">
                {state.hostUsername === myName || state.players.find((p) => p.username === myName) ? (
                  <button onClick={() => phase10Rematch(roomId)} className="flex-1 h-11 rounded-lg bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white font-bold text-sm flex items-center justify-center gap-2">
                    <RotateCcw className="w-4 h-4" /> Rematch
                  </button>
                ) : null}
                <button onClick={leave} className="flex-1 h-11 rounded-lg bg-bg-tertiary border border-border-color text-text-primary font-semibold text-sm">Leave</button>
              </div>
            </Overlay>
          )}
        </AnimatePresence>
      </div>
      <DragOverlay dropAnimation={null}>
        {dragId && cardById(dragId) ? <PlayingCard card={cardById(dragId)!} size="md" /> : null}
      </DragOverlay>
    </DndContext>
    </LayoutGroup>
  );
};

// ──────────────────────────── Sub-views ────────────────────────────
function sortHand(cards: PCard[]): PCard[] {
  const rank = (c: PCard) => (c.type === 'NUMBER' ? c.value : c.type === 'SKIP' ? 100 : 200);
  return [...cards].sort((a, b) => rank(a) - rank(b) || a.color.localeCompare(b.color));
}

function TopBar({ roomId, onLeave, onChat, subtitle }: { roomId: string; onLeave: () => void; onChat: () => void; subtitle: string; }) {
  return (
    <header className="h-12 sm:h-14 px-3 border-b border-border-color flex items-center justify-between shrink-0 bg-bg-secondary/80 backdrop-blur-sm">
      <button onClick={onLeave} className="flex items-center gap-1.5 text-text-secondary hover:text-text-primary text-sm">
        <ArrowLeft className="w-4 h-4" /> Leave
      </button>
      <div className="text-center">
        <p className="font-bold text-sm text-text-primary leading-none flex items-center gap-1.5"><Layers className="w-4 h-4 text-fuchsia-500" /> Phase 10</p>
        <p className="text-[10px] text-text-muted">{subtitle} · <span className="font-mono">{roomId}</span></p>
      </div>
      <button onClick={onChat} className="text-text-secondary hover:text-text-primary"><MessageCircle className="w-5 h-5" /></button>
    </header>
  );
}

function OpponentSeat({ p, isTurn, timerPct }: { p: PPlayer; isTurn: boolean; timerPct: number; }) {
  return (
    <div className={`relative shrink-0 w-[88px] rounded-xl border p-2 flex flex-col items-center gap-1 ${isTurn ? 'border-accent-purple bg-accent-purple/5 shadow-lg shadow-accent-purple/10' : 'border-border-color bg-bg-secondary'} ${!p.connected ? 'opacity-60' : ''}`}>
      {p.skipNext && <span className="absolute -top-1.5 -right-1.5 text-rose-500"><Ban className="w-4 h-4" /></span>}
      <div className="flex -space-x-3">
        {Array.from({ length: Math.min(5, p.handCount) }).map((_, i) => (
          <div key={i} className="w-5 h-7 rounded bg-gradient-to-br from-indigo-600 to-fuchsia-600 border border-black/20" />
        ))}
      </div>
      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold ${p.bot ? 'bg-slate-600' : 'bg-gradient-to-br from-accent-purple to-accent-hover'}`}>
        {p.bot ? <Bot className="w-4 h-4" /> : p.username.charAt(0).toUpperCase()}
      </div>
      <p className="text-[11px] font-semibold text-text-primary truncate max-w-full flex items-center gap-0.5">
        {p.username}{p.isHost && <Crown className="w-3 h-3 text-yellow-500" />}
      </p>
      <div className="flex items-center gap-1 text-[9px] text-text-muted">
        <span className={`px-1.5 py-0.5 rounded ${p.phaseCompletedThisRound ? 'bg-emerald-500/20 text-emerald-400' : 'bg-bg-tertiary'}`}>P{p.currentPhase}</span>
        <span>{p.handCount}🂠</span>
      </div>
      {isTurn && (
        <div className="w-full h-1 rounded-full bg-bg-tertiary overflow-hidden mt-0.5">
          <div className="h-full bg-accent-purple transition-all duration-300" style={{ width: `${timerPct}%` }} />
        </div>
      )}
    </div>
  );
}

function MeldView({ meld, myName, hittable, onHit }: { meld: PMeld; myName: string; hittable: boolean; onHit: () => void; }) {
  return (
    <div onClick={hittable ? onHit : undefined}
      className={`rounded-lg p-1.5 border ${hittable ? 'border-amber-400 bg-amber-400/5 cursor-pointer hover:bg-amber-400/10' : 'border-border-color bg-bg-secondary'}`}>
      <div className="text-[9px] text-text-muted mb-1 text-center">
        {meld.owner === myName ? 'You' : meld.owner} · {meld.type.toLowerCase()}
      </div>
      <div className="flex gap-0.5">
        {meld.cards.map((c) => <PlayingCard key={c.id} card={c} size="sm" />)}
      </div>
    </div>
  );
}

function ActionBtn({ onClick, icon, label, tone, disabled }: { onClick: () => void; icon: React.ReactNode; label: string; tone: 'purple' | 'amber' | 'slate'; disabled?: boolean; }) {
  const tones = {
    purple: 'from-fuchsia-500 to-purple-600',
    amber: 'from-amber-500 to-orange-600',
    slate: 'from-slate-500 to-slate-700',
  };
  return (
    <button onClick={onClick} disabled={disabled}
      className={`h-10 px-4 rounded-lg bg-gradient-to-r ${tones[tone]} text-white font-semibold text-sm flex items-center gap-1.5 disabled:opacity-40 shadow`}>
      {icon} {label}
    </button>
  );
}

function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button onClick={() => { navigator.clipboard?.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
      className="text-text-muted hover:text-accent-purple">
      {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
    </button>
  );
}

function Overlay({ children, onClose }: { children: React.ReactNode; onClose?: () => void; }) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <motion.div initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 20 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm bg-bg-secondary border border-border-color rounded-2xl p-4 shadow-2xl">
        {children}
      </motion.div>
    </motion.div>
  );
}

function Toasts({ toasts }: { toasts: Toast[] }) {
  return (
    <div className="fixed top-16 left-1/2 -translate-x-1/2 z-[60] flex flex-col items-center gap-1.5 pointer-events-none">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div key={t.id} initial={{ opacity: 0, y: -10, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold shadow-lg ${t.kind === 'error' ? 'bg-rose-500 text-white' : t.kind === 'good' ? 'bg-emerald-500 text-white' : 'bg-bg-tertiary text-text-primary border border-border-color'}`}>
            {t.text}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

function ChatPanel({ open, onClose, chat, input, setInput, onSend, myName, endRef }: {
  open: boolean; onClose: () => void; chat: ChatMsg[]; input: string; setInput: (s: string) => void;
  onSend: () => void; myName: string; endRef: React.RefObject<HTMLDivElement | null>;
}) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} transition={{ type: 'tween', duration: 0.25 }}
          className="fixed right-0 top-0 bottom-0 w-full max-w-sm z-[55] bg-bg-secondary border-l border-border-color flex flex-col">
          <div className="h-12 px-3 flex items-center justify-between border-b border-border-color">
            <span className="font-bold text-text-primary text-sm">Table chat</span>
            <button onClick={onClose} className="text-text-muted hover:text-text-primary"><X className="w-5 h-5" /></button>
          </div>
          <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2">
            {chat.length === 0 && <p className="text-xs text-text-muted text-center mt-4">Say hi 👋</p>}
            {chat.map((m, i) => (
              <div key={i} className={`max-w-[80%] px-3 py-1.5 rounded-xl text-sm ${m.sender === myName ? 'self-end bg-accent-purple text-white' : 'self-start bg-bg-tertiary text-text-primary'}`}>
                {m.sender !== myName && <span className="block text-[10px] text-text-muted">{m.sender}</span>}
                {m.message}
              </div>
            ))}
            <div ref={endRef} />
          </div>
          <div className="p-2 border-t border-border-color flex gap-2">
            <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && onSend()}
              placeholder="Message…" className="flex-1 h-10 bg-bg-tertiary border border-border-color rounded-lg px-3 text-sm text-text-primary focus:border-accent-purple outline-none" />
            <button onClick={onSend} className="w-10 h-10 rounded-lg bg-accent-purple text-white flex items-center justify-center"><Send className="w-4 h-4" /></button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ──────────────────────────── Menu ────────────────────────────
function MenuScreen(props: {
  onBack: () => void; creating: boolean; menuError: string;
  optMaxPlayers: number; setOptMaxPlayers: (n: number) => void;
  optTimer: number; setOptTimer: (n: number) => void;
  optBots: boolean; setOptBots: (b: boolean) => void;
  joinCode: string; setJoinCode: (s: string) => void;
  onCreate: () => void; onJoin: () => void;
}) {
  const { onBack, creating, menuError, optMaxPlayers, setOptMaxPlayers, optTimer, setOptTimer, optBots, setOptBots, joinCode, setJoinCode, onCreate, onJoin } = props;
  return (
    <div className="flex flex-col h-full w-full bg-bg-primary pb-16 lg:pb-0">
      <header className="h-12 sm:h-14 px-3 border-b border-border-color flex items-center gap-2 shrink-0 bg-bg-secondary/80">
        <button onClick={onBack} className="flex items-center gap-1.5 text-text-secondary hover:text-text-primary text-sm"><ArrowLeft className="w-4 h-4" /> Games</button>
      </header>
      <div className="flex-1 overflow-y-auto px-4 py-6 max-w-md mx-auto w-full">
        <div className="text-center mb-6">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-fuchsia-500 to-purple-600 flex items-center justify-center shadow-lg shadow-fuchsia-500/20 mb-3">
            <Layers className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-text-primary">Phase 10</h1>
          <p className="text-sm text-text-secondary">Race through 10 phases · 2-6 players</p>
        </div>

        {menuError && <div className="mb-3 text-sm text-rose-400 bg-rose-500/10 rounded-lg px-3 py-2">{menuError}</div>}

        <div className="bg-bg-secondary border border-border-color rounded-2xl p-4 mb-4">
          <h3 className="font-bold text-text-primary mb-3 flex items-center gap-2"><Plus className="w-4 h-4 text-accent-purple" /> Create a room</h3>

          <label className="text-xs text-text-muted">Max players</label>
          <div className="flex gap-1.5 mt-1 mb-3">
            {[2, 3, 4, 5, 6].map((n) => (
              <button key={n} onClick={() => setOptMaxPlayers(n)}
                className={`flex-1 h-9 rounded-lg text-sm font-semibold border ${optMaxPlayers === n ? 'bg-accent-purple text-white border-accent-purple' : 'bg-bg-tertiary text-text-secondary border-border-color'}`}>{n}</button>
            ))}
          </div>

          <label className="text-xs text-text-muted">Turn timer</label>
          <div className="flex gap-1.5 mt-1 mb-3">
            {[30, 45, 60, 90].map((n) => (
              <button key={n} onClick={() => setOptTimer(n)}
                className={`flex-1 h-9 rounded-lg text-sm font-semibold border ${optTimer === n ? 'bg-accent-purple text-white border-accent-purple' : 'bg-bg-tertiary text-text-secondary border-border-color'}`}>{n}s</button>
            ))}
          </div>

          <button onClick={() => setOptBots(!optBots)} className="w-full flex items-center justify-between bg-bg-tertiary border border-border-color rounded-lg px-3 py-2.5 mb-4">
            <span className="text-sm text-text-primary flex items-center gap-2"><Bot className="w-4 h-4 text-accent-purple" /> Allow bots</span>
            <span className={`w-10 h-6 rounded-full p-0.5 transition-colors ${optBots ? 'bg-accent-purple' : 'bg-bg-secondary border border-border-color'}`}>
              <span className={`block w-5 h-5 rounded-full bg-white transition-transform ${optBots ? 'translate-x-4' : ''}`} />
            </span>
          </button>

          <button onClick={onCreate} disabled={creating}
            className="w-full h-12 rounded-xl bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white font-bold flex items-center justify-center gap-2 disabled:opacity-50">
            {creating ? 'Creating…' : <><Play className="w-5 h-5" /> Create Room</>}
          </button>
        </div>

        <div className="bg-bg-secondary border border-border-color rounded-2xl p-4">
          <h3 className="font-bold text-text-primary mb-3 flex items-center gap-2"><Users className="w-4 h-4 text-accent-orange" /> Join a room</h3>
          <div className="flex gap-2">
            <input value={joinCode} onChange={(e) => setJoinCode(e.target.value.toUpperCase())} onKeyDown={(e) => e.key === 'Enter' && onJoin()}
              placeholder="ROOM CODE" maxLength={8}
              className="flex-1 h-12 bg-bg-tertiary border border-border-color rounded-xl px-4 font-mono tracking-widest text-center text-text-primary focus:border-accent-purple outline-none" />
            <button onClick={onJoin} disabled={!joinCode.trim()}
              className="h-12 px-5 rounded-xl bg-bg-tertiary border border-border-color text-text-primary font-semibold disabled:opacity-40">Join</button>
          </div>
        </div>
      </div>
    </div>
  );
}
