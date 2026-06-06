import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, Users, Bot, Crown, Plus, Play, Copy, Check, Trash2, Sparkles,
  MessageCircle, Send, X, Trophy, RotateCcw, Dices, Home, Shield, Castle,
} from 'lucide-react';
import {
  subscribe, chowkaJoin, chowkaLeave, chowkaStart, chowkaAddBot, chowkaRemoveBot,
  chowkaRematch, chowkaRoll, chowkaMove, chowkaChat,
} from '../../services/stompClient';
import { ChowkaAPI } from '../../services/api';
import { HowToPlay } from './HowToPlay';
import { GameInviteButton } from './GameInviteButton';

// ──────────────────────────── Types ────────────────────────────
type Color = 'RED' | 'GREEN' | 'BLUE' | 'YELLOW';
type Status = 'WAITING' | 'IN_PROGRESS' | 'FINISHED';

interface CPiece { id: number; pathIndex: number; inBase: boolean; finished: boolean; row?: number; col?: number; }
interface CPlayer {
  username: string; color: Color; seat: number; bot: boolean; connected: boolean;
  isHost: boolean; isCurrent: boolean; finishedCount: number;
  path: number[][]; pieces: CPiece[];
}
interface CState {
  roomId: string; status: Status; hostUsername: string; openStart: boolean;
  maxPlayers: number; minPlayers: number; turnOrder: string[]; currentTurn: string | null;
  lastRoll: number; awaitingMove: boolean; legalPieceIds: number[]; winner: string | null;
  centerIndex: number; pathLength: number; safeCells: number[][]; chat: any[];
  players: CPlayer[];
}
interface Toast { id: number; text: string; kind: 'info' | 'error' | 'good'; }
interface ChatMsg { sender: string; message: string; }

const SIZE = 5;
const ACTIVE_KEY = 'chowka_active_room'; // remembers an in-progress room for quick rejoin

// ── Seat colour styling ──
const COLOR: Record<Color, { token: string; ring: string; soft: string; text: string; dot: string }> = {
  RED:    { token: 'bg-gradient-to-br from-red-400 to-red-600',       ring: 'ring-red-300',    soft: 'bg-red-500/15 border-red-500/40',       text: 'text-red-400',    dot: 'bg-red-500' },
  GREEN:  { token: 'bg-gradient-to-br from-emerald-400 to-emerald-600', ring: 'ring-emerald-300', soft: 'bg-emerald-500/15 border-emerald-500/40', text: 'text-emerald-400', dot: 'bg-emerald-500' },
  BLUE:   { token: 'bg-gradient-to-br from-sky-400 to-blue-600',       ring: 'ring-sky-300',    soft: 'bg-sky-500/15 border-sky-500/40',       text: 'text-sky-400',    dot: 'bg-sky-500' },
  YELLOW: { token: 'bg-gradient-to-br from-amber-300 to-amber-500',    ring: 'ring-amber-200',  soft: 'bg-amber-400/15 border-amber-400/40',   text: 'text-amber-400',  dot: 'bg-amber-400' },
};

// ── Solid pawn colours (for the SVG Ludo token gradients) ──
const PAWN: Record<Color, { light: string; base: string; dark: string }> = {
  RED:    { light: '#fca5a5', base: '#ef4444', dark: '#b91c1c' },
  GREEN:  { light: '#6ee7b7', base: '#10b981', dark: '#047857' },
  BLUE:   { light: '#7dd3fc', base: '#3b82f6', dark: '#1d4ed8' },
  YELLOW: { light: '#fde68a', base: '#f59e0b', dark: '#b45309' },
};

/** A classic Ludo-style pawn: spherical head on a flared base. */
const Pawn = ({ color, uid, dim }: { color: Color; uid: string; dim?: boolean }) => {
  const p = PAWN[color];
  const gid = `pawn-${uid}`;
  return (
    <svg viewBox="0 0 64 80" preserveAspectRatio="xMidYMax meet" className="w-full h-full overflow-visible"
      style={{ filter: 'drop-shadow(0 2px 2px rgba(0,0,0,0.45))', opacity: dim ? 0.92 : 1 }}>
      <defs>
        <radialGradient id={`${gid}-head`} cx="38%" cy="32%" r="75%">
          <stop offset="0%" stopColor={p.light} />
          <stop offset="55%" stopColor={p.base} />
          <stop offset="100%" stopColor={p.dark} />
        </radialGradient>
        <linearGradient id={`${gid}-body`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={p.dark} />
          <stop offset="45%" stopColor={p.base} />
          <stop offset="100%" stopColor={p.dark} />
        </linearGradient>
      </defs>
      {/* base shadow */}
      <ellipse cx="32" cy="73" rx="20" ry="5.5" fill="rgba(0,0,0,0.22)" />
      {/* flared base + body */}
      <path d="M14 72 C14 64 22 60 24 44 L40 44 C42 60 50 64 50 72 Z"
        fill={`url(#${gid}-body)`} stroke="#ffffff" strokeWidth="2.5" strokeLinejoin="round" />
      <ellipse cx="32" cy="72" rx="18" ry="4.5" fill={p.dark} stroke="#ffffff" strokeWidth="2" />
      {/* neck ring */}
      <ellipse cx="32" cy="44" rx="9" ry="3" fill={p.base} stroke="#ffffff" strokeWidth="2" />
      {/* head */}
      <circle cx="32" cy="24" r="15" fill={`url(#${gid}-head)`} stroke="#ffffff" strokeWidth="2.5" />
      {/* highlight */}
      <ellipse cx="26" cy="18" rx="4.5" ry="6" fill="rgba(255,255,255,0.55)" />
    </svg>
  );
};

/** A single cowrie shell — "open" shows the toothed slit (face up), else the smooth back. */
const CowrieShell = ({ open, idx, rolling }: { open: boolean; idx: number; rolling: boolean }) => {
  // Deterministic per-shell scatter so the throw feels physical, not synced.
  const drift = (idx - 1.5) * 9;        // fan outward left↔right
  const spins = 720 + idx * 180;        // each shell tumbles a different amount
  const tilt = idx % 2 === 0 ? 1 : -1;
  return (
    <div className="relative w-7 h-9 sm:w-8 sm:h-10 flex items-end justify-center">
      {/* shell's little ground shadow */}
      <motion.span
        className="absolute -bottom-1 w-5 h-1.5 rounded-full bg-black/40 blur-[2px]"
        animate={rolling
          ? { scaleX: [1, 0.55, 0.85, 0.6, 1], opacity: [0.4, 0.16, 0.3, 0.18, 0.4] }
          : { scaleX: 1, opacity: 0.4 }}
        transition={rolling ? { duration: 1, delay: idx * 0.06, ease: 'easeInOut' } : { duration: 0.2 }}
      />
      <motion.div
        className="w-full h-full"
        style={{ transformStyle: 'preserve-3d' }}
        animate={rolling
          ? {
              y: [0, -40, -12, -26, -4, 0],
              x: [0, drift * 0.5, drift, drift * 0.7, drift * 0.3, 0],
              rotateX: [0, spins * 0.5, spins * 0.8, spins, spins, spins],
              rotate: [0, -34 * tilt, 26 * tilt, -14 * tilt, 6 * tilt, 0],
              scale: [1, 1.14, 0.95, 1.06, 0.99, 1],
            }
          : { y: 0, x: 0, rotateX: 0, rotate: 0, scale: 1 }}
        transition={rolling
          ? { duration: 1.05, delay: idx * 0.06, ease: [0.22, 0.61, 0.36, 1], times: [0, 0.22, 0.45, 0.66, 0.85, 1] }
          : { type: 'spring', stiffness: 320, damping: 18 }}
      >
        <svg viewBox="0 0 44 56" className="w-full h-full" style={{ filter: 'drop-shadow(0 1.5px 2px rgba(0,0,0,0.45))' }}>
          <defs>
            <radialGradient id={`cowrie-${idx}`} cx="40%" cy="30%" r="80%">
              <stop offset="0%" stopColor="#fffdf6" />
              <stop offset="60%" stopColor="#f0e6cf" />
              <stop offset="100%" stopColor="#d8c49a" />
            </radialGradient>
          </defs>
          {/* shell body */}
          <ellipse cx="22" cy="28" rx="17" ry="25" fill={`url(#cowrie-${idx})`} stroke="#b9a172" strokeWidth="1.6" />
          {rolling ? (
            // tumbling — neutral ridge
            <path d="M22 6 Q30 28 22 50" fill="none" stroke="#c9b389" strokeWidth="1.4" opacity="0.6" />
          ) : open ? (
            <>
              {/* the toothed opening (face up) */}
              <path d="M22 9 C16 20 16 36 22 47 C28 36 28 20 22 9 Z" fill="#8a7350" />
              <path d="M22 11 C17 21 17 35 22 45 C27 35 27 21 22 11 Z" fill="#5c4a30" />
              {[16, 22, 28, 34, 40].map((y) => (
                <line key={y} x1="18" y1={y} x2="26" y2={y} stroke="#efe4c9" strokeWidth="1.1" />
              ))}
            </>
          ) : (
            // smooth humped back (face down)
            <ellipse cx="18" cy="20" rx="5" ry="8" fill="rgba(255,255,255,0.55)" />
          )}
        </svg>
      </motion.div>
    </div>
  );
};

/** The four-cowrie throw with a toss animation + result badge. */
const CowrieDice = ({ roll, rolling, onRoll, canRoll }: {
  roll: number; rolling: boolean; onRoll: () => void; canRoll: boolean;
}) => {
  const open = rolling ? 0 : shellsOpen(roll); // shells showing the slit
  return (
    <button onClick={onRoll} disabled={!canRoll}
      className={`flex flex-col items-center gap-1.5 rounded-2xl px-4 py-3 bg-bg-secondary border transition-all ${
        canRoll ? 'border-accent-orange/50 hover:bg-hover-bg cursor-pointer shadow-md' : 'border-border-color cursor-default'}`}
      title={canRoll ? 'Roll the cowries' : 'Cowries'}>
      <div className="flex items-end gap-1.5 h-14 overflow-visible" style={{ perspective: 320 }}>
        {[0, 1, 2, 3].map((i) => <CowrieShell key={i} idx={i} rolling={rolling} open={i < open} />)}
      </div>
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] uppercase tracking-wide text-text-muted">cowries</span>
        <span className={`min-w-6 text-center text-sm font-bold rounded-md px-1.5 ${rolling ? 'text-text-muted' : 'text-text-primary bg-accent-orange/15'}`}>
          {rolling ? '…' : roll || '–'}
        </span>
      </div>
    </button>
  );
};

const isSafeCell = (safe: number[][], r: number, c: number) => safe.some(([sr, sc]) => sr === r && sc === c);
const isCenterCell = (r: number, c: number) => r === 2 && c === 2;

// How many cowrie shells show "open" for a given roll value (8 = all four closed).
const shellsOpen = (roll: number) => (roll === 8 ? 0 : roll);

export const ChowkaBara = ({ currentUser, onBack, initialRoomId }: {
  currentUser: any; onBack: () => void; initialRoomId?: string;
}) => {
  const myName: string = currentUser?.username;

  const [screen, setScreen] = useState<'menu' | 'connecting' | 'room'>(initialRoomId ? 'connecting' : 'menu');
  const [roomId, setRoomId] = useState<string>(initialRoomId || '');
  const [joinCode, setJoinCode] = useState('');
  const [creating, setCreating] = useState(false);
  const [menuError, setMenuError] = useState('');
  const [copied, setCopied] = useState(false);

  // create options
  const [optMaxPlayers, setOptMaxPlayers] = useState(2);
  const [optOpenStart, setOptOpenStart] = useState(false);
  const [savedRoom, setSavedRoom] = useState('');     // an in-progress room to rejoin
  const [confirmLeave, setConfirmLeave] = useState(false);

  // live state
  const [state, setState] = useState<CState | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [gameOver, setGameOver] = useState<{ winner: string | null; standings: any[] } | null>(null);

  // dice animation
  const [rolling, setRolling] = useState(false);
  const [shownRoll, setShownRoll] = useState(0);

  // capture flash: "row-col" cell key that should pulse red
  const [captureFlash, setCaptureFlash] = useState<string | null>(null);

  // tile-by-tile movement animation (uid -> waypoints along the path)
  const prevPos = useRef<Map<string, number>>(new Map());
  const animNonce = useRef(0);
  const [anims, setAnims] = useState<Map<string, { left: string[]; top: string[]; ms: number; nonce: number }>>(new Map());

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

  const disp = (name: string | null | undefined) => (name === myName ? 'You' : name || '');

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [chat]);

  // Remember an in-progress room so the user can rejoin if they exit by mistake.
  useEffect(() => {
    if (!roomId || !state) return;
    try {
      if (state.status === 'IN_PROGRESS' && !state.winner) localStorage.setItem(ACTIVE_KEY, roomId);
      else localStorage.removeItem(ACTIVE_KEY);
    } catch {}
  }, [state?.status, state?.winner, roomId]); // eslint-disable-line

  // On the menu, surface a saved active room to rejoin.
  useEffect(() => {
    if (screen !== 'menu') return;
    try { setSavedRoom(localStorage.getItem(ACTIVE_KEY) || ''); } catch {}
  }, [screen]);

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
          if (msg.state) { setState(msg.state as CState); setScreen('room'); }
          break;
        case 'TURN_START':
          if (msg.currentTurn === myName) pushToast('Your turn — roll the cowries!', 'good');
          break;
        case 'DICE_ROLLED':
          setRolling(true);
          window.setTimeout(() => { setShownRoll(msg.roll || 0); setRolling(false); }, 1150);
          break;
        case 'NO_MOVE':
          pushToast(`${disp(msg.player)} rolled ${msg.roll} — no move`, msg.player === myName ? 'error' : 'info');
          break;
        case 'PIECE_CAPTURED':
          (msg.captures || []).forEach((cap: any) => {
            setCaptureFlash(`${cap.row}-${cap.col}`);
            window.setTimeout(() => setCaptureFlash(null), 700);
            pushToast(
              cap.owner === myName ? 'Your piece was sent home! 💥' : `${disp(msg.player)} captured ${disp(cap.owner)}`,
              cap.owner === myName ? 'error' : 'good',
            );
          });
          break;
        case 'PIECE_HOME':
          pushToast(`${disp(msg.player)} got a piece home! 🏠`, msg.player === myName ? 'good' : 'info');
          break;
        case 'PLAYER_JOINED':
        case 'PLAYER_LEFT':
        case 'BOT_ADDED':
          if (msg.message) pushToast(msg.message);
          break;
        case 'GAME_OVER':
          setGameOver({ winner: msg.winner, standings: msg.standings || [] });
          if (msg.winner === myName) pushToast('You win! 🏆', 'good');
          break;
        case 'REMATCH':
          setGameOver(null);
          pushToast('Back to the lobby!', 'good');
          break;
        case 'CHAT_MESSAGE':
          setChat((c) => [...c, { sender: msg.sender, message: msg.message }]);
          break;
        case 'ERROR':
          pushToast(msg.message || 'Something went wrong', 'error');
          break;
      }
    };

    subscribe(`/topic/chowka/${roomId}`, onEvent).then((s) => subs.push(s));
    subscribe(`/user/queue/chowka`, onEvent).then((s) => subs.push(s));
    const jt = window.setTimeout(() => chowkaJoin(roomId), 350);

    return () => {
      cancelled = true;
      window.clearTimeout(jt);
      subs.forEach((s) => s?.unsubscribe());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  // keep the dice display in sync with server state (e.g. after reconnect)
  useEffect(() => { if (state && !rolling) setShownRoll(state.lastRoll || 0); }, [state?.lastRoll]); // eslint-disable-line

  // ──────── Create / Join ────────
  const handleCreate = async () => {
    setCreating(true); setMenuError('');
    try {
      const res = await ChowkaAPI.createRoom({ hostUsername: myName, maxPlayers: optMaxPlayers, openStart: optOpenStart });
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
  const clearActive = () => { try { localStorage.removeItem(ACTIVE_KEY); } catch {} };
  // Actually leave the room and return to the games list.
  const doLeave = () => { setConfirmLeave(false); clearActive(); if (roomId) chowkaLeave(roomId); onBack(); };
  // Guard against accidental exits while a game is in progress.
  const leave = () => {
    if (state && state.status === 'IN_PROGRESS' && !state.winner) setConfirmLeave(true);
    else doLeave();
  };
  const rejoin = () => { if (savedRoom) { setRoomId(savedRoom); setScreen('connecting'); } };
  const copyCode = () => {
    navigator.clipboard?.writeText(roomId).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }).catch(() => {});
  };
  const sendChat = () => {
    const m = chatInput.trim();
    if (!m || !roomId) return;
    chowkaChat(roomId, m);
    setChatInput('');
  };

  // ──────── Derived ────────
  const isHost = state?.hostUsername === myName;
  const isMyTurn = state?.currentTurn === myName && state?.status === 'IN_PROGRESS' && !state?.winner;
  const canRoll = !!isMyTurn && !state?.awaitingMove;
  const canMove = !!isMyTurn && !!state?.awaitingMove;
  const myLegal = useMemo(() => (canMove ? (state?.legalPieceIds || []) : []), [canMove, state?.legalPieceIds]);

  // All pieces currently on the board, grouped by cell for clustering.
  const cellTokens = useMemo(() => {
    const map = new Map<string, { player: CPlayer; piece: CPiece }[]>();
    state?.players.forEach((pl) => pl.pieces.forEach((pc) => {
      if (pc.row == null || pc.col == null) return; // base pieces live in the tray
      const key = `${pc.row}-${pc.col}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push({ player: pl, piece: pc });
    }));
    return map;
  }, [state?.players]);

  // When a piece's path index advances, animate it through every intermediate
  // cell (straight along an edge, turning at corners) instead of teleporting.
  useEffect(() => {
    if (!state) return;
    const cellPct = 100 / SIZE;
    const additions: [string, { left: string[]; top: string[]; ms: number; nonce: number }][] = [];
    state.players.forEach((pl) =>
      pl.pieces.forEach((pc) => {
        const uid = `${pl.color}-${pc.id}`;
        const prev = prevPos.current.get(uid);
        const cur = pc.pathIndex;
        if (prev != null && prev >= 0 && cur > prev && pl.path?.length) {
          const left: string[] = [], top: string[] = [];
          for (let k = prev; k <= cur; k++) {
            const cell = pl.path[k];
            if (!cell) continue;
            left.push(`${(cell[1] + 0.5) * cellPct}%`);
            top.push(`${(cell[0] + 0.5) * cellPct}%`);
          }
          if (left.length > 1) {
            const ms = (cur - prev) * 280; // ~tile-by-tile, 280ms per tile
            const nonce = ++animNonce.current;
            additions.push([uid, { left, top, ms, nonce }]);
            window.setTimeout(() => setAnims((m) => { const n = new Map(m); if (n.get(uid)?.nonce === nonce) n.delete(uid); return n; }), ms + 220);
          }
        }
        prevPos.current.set(uid, cur);
      }),
    );
    if (additions.length) setAnims((m) => { const n = new Map(m); additions.forEach(([k, v]) => n.set(k, v)); return n; });
  }, [state]);

  const onPieceClick = (pieceId: number) => {
    if (!canMove || !myLegal.includes(pieceId) || !roomId) return;
    chowkaMove(roomId, pieceId);
  };

  // ════════════════════════ MENU ════════════════════════
  if (screen === 'menu') {
    return (
      <div className="flex flex-col h-full w-full bg-bg-primary overflow-y-auto">
        <header className="h-14 px-4 sm:px-6 border-b border-border-color flex items-center justify-between shrink-0 bg-bg-secondary/80 backdrop-blur-sm">
          <button onClick={onBack} className="flex items-center gap-1.5 text-text-secondary hover:text-text-primary text-sm"><ArrowLeft className="w-4 h-4" /> Games</button>
          <HowToPlay title="How to play Chowka Bara" steps={CHOWKA_RULES} tip="Land on an opponent (off a safe ✦ square) to send them home. Roll a 4 or 8 for a bonus turn!" />
        </header>

        <div className="flex-1 flex items-center justify-center p-4 sm:p-8">
          <div className="w-full max-w-md flex flex-col gap-6">
            <div className="text-center">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-orange-500 to-rose-600 flex items-center justify-center mx-auto mb-3 shadow-lg shadow-orange-500/30">
                <Castle className="w-8 h-8 text-white" />
              </div>
              <h1 className="text-2xl font-bold text-text-primary">Chowka Bara</h1>
              <p className="text-sm text-text-secondary mt-1">The classic Indian cross-and-circle race. Bring all 4 pieces home to win.</p>
            </div>

            {/* Rejoin an in-progress game left by mistake */}
            {savedRoom && (
              <button onClick={rejoin}
                className="flex items-center gap-3 bg-emerald-500/10 border border-emerald-500/40 rounded-2xl p-4 text-left hover:bg-emerald-500/15 transition-colors">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center shrink-0">
                  <RotateCcw className="w-5 h-5 text-emerald-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm text-text-primary">Rejoin your game</div>
                  <div className="text-[11px] text-text-muted">You have a game in progress · <span className="font-mono">{savedRoom}</span></div>
                </div>
                <ArrowLeft className="w-4 h-4 text-emerald-400 rotate-180 shrink-0" />
              </button>
            )}

            {/* Create */}
            <div className="bg-bg-secondary border border-border-color rounded-2xl p-5 flex flex-col gap-4">
              <h2 className="font-semibold text-text-primary flex items-center gap-2"><Plus className="w-4 h-4 text-accent-orange" /> Create a room</h2>

              <div>
                <label className="text-xs text-text-muted mb-1.5 block">Players</label>
                <div className="flex gap-2">
                  {[2, 3, 4].map((n) => (
                    <button key={n} onClick={() => setOptMaxPlayers(n)}
                      className={`flex-1 h-10 rounded-xl text-sm font-semibold border transition-all ${optMaxPlayers === n ? 'bg-accent-orange/15 border-accent-orange/50 text-accent-orange' : 'border-border-color text-text-secondary hover:bg-hover-bg'}`}>
                      {n}
                    </button>
                  ))}
                </div>
              </div>

              <button onClick={() => setOptOpenStart((v) => !v)} className="flex items-center justify-between gap-3 text-left">
                <div>
                  <div className="text-sm font-medium text-text-primary">Open start</div>
                  <div className="text-[11px] text-text-muted">{optOpenStart ? 'All pieces begin on the board' : 'Roll a 1, 4 or 8 to bring pieces out'}</div>
                </div>
                <div className={`w-11 h-6 rounded-full p-0.5 transition-colors shrink-0 ${optOpenStart ? 'bg-accent-orange' : 'bg-bg-tertiary border border-border-color'}`}>
                  <div className={`w-5 h-5 rounded-full bg-white transition-transform ${optOpenStart ? 'translate-x-5' : ''}`} />
                </div>
              </button>

              <button onClick={handleCreate} disabled={creating}
                className="h-11 rounded-xl bg-gradient-to-r from-orange-500 to-rose-600 text-white font-semibold shadow-lg hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2">
                {creating ? 'Creating…' : <><Play className="w-4 h-4" /> Create room</>}
              </button>
            </div>

            {/* Join */}
            <div className="bg-bg-secondary border border-border-color rounded-2xl p-5 flex flex-col gap-3">
              <h2 className="font-semibold text-text-primary flex items-center gap-2"><Users className="w-4 h-4 text-accent-purple" /> Join with a code</h2>
              <div className="flex gap-2">
                <input value={joinCode} onChange={(e) => setJoinCode(e.target.value.toUpperCase())} onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
                  placeholder="ROOM CODE" maxLength={6}
                  className="flex-1 h-11 px-4 rounded-xl bg-bg-tertiary border border-border-color text-text-primary font-mono tracking-widest text-center outline-none focus:border-accent-purple/50" />
                <button onClick={handleJoin} className="px-5 h-11 rounded-xl bg-bg-tertiary border border-border-color text-text-primary font-semibold hover:bg-hover-bg">Join</button>
              </div>
            </div>

            {menuError && <p className="text-center text-sm text-red-400">{menuError}</p>}
          </div>
        </div>
      </div>
    );
  }

  // ════════════════════════ CONNECTING ════════════════════════
  if (screen === 'connecting' || !state) {
    return (
      <div className="flex flex-col items-center justify-center h-full w-full bg-bg-primary gap-4">
        <div className="w-12 h-12 rounded-full border-2 border-accent-orange/30 border-t-accent-orange animate-spin" />
        <p className="text-text-secondary text-sm">Connecting to room <span className="font-mono text-text-primary">{roomId}</span>…</p>
        <button onClick={leave} className="text-xs text-text-muted hover:text-text-secondary">Cancel</button>
      </div>
    );
  }

  const inLobby = state.status === 'WAITING';

  // ════════════════════════ ROOM ════════════════════════
  return (
    <div className="flex flex-col h-full w-full bg-bg-primary">
      {/* Header */}
      <header className="h-14 px-3 sm:px-5 border-b border-border-color flex items-center justify-between shrink-0 bg-bg-secondary/80 backdrop-blur-sm gap-2">
        <button onClick={leave} className="flex items-center gap-1.5 text-text-secondary hover:text-text-primary text-sm shrink-0"><ArrowLeft className="w-4 h-4" /> <span className="hidden sm:inline">Leave</span></button>
        <div className="flex items-center gap-2 min-w-0">
          <Castle className="w-4 h-4 text-accent-orange shrink-0" />
          <span className="font-bold text-text-primary text-sm sm:text-base truncate">Chowka Bara</span>
          <button onClick={copyCode} className="flex items-center gap-1 text-[11px] font-mono text-text-muted bg-hover-bg border border-border-color rounded-md px-2 py-0.5 hover:text-text-primary shrink-0">
            {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />} {roomId}
          </button>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={() => setChatOpen((v) => !v)} className="p-2 rounded-xl hover:bg-hover-bg text-text-secondary relative" title="Chat">
            <MessageCircle className="w-5 h-5" />
          </button>
          <HowToPlay title="How to play Chowka Bara" steps={CHOWKA_RULES} tip="Land on an opponent (off a safe ✦ square) to send them home. Roll a 4 or 8 for a bonus turn!" />
        </div>
      </header>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-3 sm:px-5 py-4 sm:py-6 pb-24 flex flex-col gap-4">

          {/* Player panels */}
          <div className={`grid gap-2 ${state.players.length > 2 ? 'grid-cols-2' : 'grid-cols-2'}`}>
            {state.players.map((p) => {
              const c = COLOR[p.color];
              const basePieces = p.pieces.filter((x) => x.inBase);
              const mine = p.username === myName;
              return (
                <div key={p.username}
                  className={`rounded-xl border p-2.5 flex flex-col gap-1.5 transition-all ${p.isCurrent ? `${c.soft} shadow-md` : 'bg-bg-secondary border-border-color'}`}>
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${c.dot} ${p.isCurrent ? 'animate-pulse' : ''}`} />
                    <span className="text-[13px] font-semibold text-text-primary truncate flex items-center gap-1">
                      {p.bot && <Bot className="w-3 h-3 text-text-muted" />}
                      {disp(p.username)}
                      {p.isHost && <Crown className="w-3 h-3 text-yellow-500" />}
                    </span>
                    {!p.connected && !p.bot && <span className="text-[9px] text-text-muted ml-auto">offline</span>}
                  </div>
                  <div className="flex items-center gap-1.5">
                    {/* home progress pips */}
                    {Array.from({ length: 4 }).map((_, i) => (
                      <span key={i} className={`w-4 h-4 rounded-full border flex items-center justify-center ${i < p.finishedCount ? `${c.token} border-transparent` : 'border-border-color'}`}>
                        {i < p.finishedCount && <Home className="w-2 h-2 text-white" />}
                      </span>
                    ))}
                    {/* base tray — pieces waiting to enter */}
                    {basePieces.length > 0 && (
                      <span className="ml-auto flex items-center gap-1 bg-bg-tertiary/70 rounded-lg px-1.5 py-0.5">
                        {basePieces.map((pc) => {
                          const movable = mine && myLegal.includes(pc.id);
                          return (
                            <button key={pc.id} onClick={() => onPieceClick(pc.id)} disabled={!movable}
                              title={movable ? 'Bring this piece out' : 'In base'}
                              className={`w-5 h-6 flex items-end justify-center ${movable ? 'cursor-pointer animate-bounce' : 'opacity-70 cursor-default'}`}>
                              <Pawn color={p.color} uid={`base-${p.color}-${pc.id}`} />
                            </button>
                          );
                        })}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* ════ LOBBY ════ */}
          {inLobby ? (
            <div className="bg-bg-secondary border border-border-color rounded-2xl p-5 flex flex-col gap-4">
              <div className="text-center">
                <p className="text-sm text-text-secondary">Invite friends, share code <span className="font-mono font-bold text-text-primary">{roomId}</span>, or add bots to fill seats.</p>
                <p className="text-[11px] text-text-muted mt-1">{state.openStart ? 'Open start' : 'Traditional start'} · {state.players.length}/{state.maxPlayers} players</p>
              </div>

              <GameInviteButton currentUser={currentUser} kind="chowka" roomId={roomId} label="Chowka Bara" className="w-full justify-center" />

              {isHost && (
                <div className="flex flex-col gap-2">
                  {state.players.length < state.maxPlayers && (
                    <button onClick={() => chowkaAddBot(roomId)} className="h-10 rounded-xl border border-border-color text-text-secondary hover:bg-hover-bg flex items-center justify-center gap-2 text-sm font-medium">
                      <Bot className="w-4 h-4" /> Add bot
                    </button>
                  )}
                  {state.players.some((p) => p.bot) && (
                    <div className="flex flex-wrap gap-1.5 justify-center">
                      {state.players.filter((p) => p.bot).map((b) => (
                        <button key={b.username} onClick={() => chowkaRemoveBot(roomId, b.username)}
                          className="text-[11px] px-2 py-1 rounded-lg bg-hover-bg border border-border-color text-text-muted hover:text-red-400 flex items-center gap-1">
                          <Trash2 className="w-3 h-3" /> {b.username}
                        </button>
                      ))}
                    </div>
                  )}
                  <button onClick={() => chowkaStart(roomId)} disabled={state.players.length < state.minPlayers}
                    className="h-11 rounded-xl bg-gradient-to-r from-orange-500 to-rose-600 text-white font-semibold shadow-lg hover:opacity-90 disabled:opacity-40 flex items-center justify-center gap-2">
                    <Play className="w-4 h-4" /> {state.players.length < state.minPlayers ? `Need ${state.minPlayers}+ players` : 'Start game'}
                  </button>
                </div>
              )}
              {!isHost && <p className="text-center text-sm text-text-muted">Waiting for the host to start…</p>}
            </div>
          ) : (
            <>
              {/* ════ BOARD ════ */}
              <div className="relative w-full max-w-[520px] mx-auto aspect-square select-none">
                {/* grid cells */}
                <div className="absolute inset-0 grid grid-cols-5 grid-rows-5 gap-1 p-1 bg-bg-secondary rounded-2xl border border-border-color">
                  {Array.from({ length: SIZE * SIZE }).map((_, idx) => {
                    const r = Math.floor(idx / SIZE), col = idx % SIZE;
                    const safe = isSafeCell(state.safeCells, r, col);
                    const center = isCenterCell(r, col);
                    const flashing = captureFlash === `${r}-${col}`;
                    return (
                      <div key={idx}
                        className={`relative rounded-md flex items-center justify-center transition-colors ${
                          center ? 'bg-gradient-to-br from-orange-500/25 to-rose-600/25 border border-orange-500/40'
                          : safe ? 'bg-accent-purple/10 border border-accent-purple/30'
                          : 'bg-bg-tertiary/60 border border-border-color/60'
                        } ${flashing ? '!bg-red-500/40' : ''}`}>
                        {center ? <Home className="w-5 h-5 text-orange-400/80" />
                          : safe ? <span className="text-accent-purple/50 text-lg leading-none">✦</span> : null}
                      </div>
                    );
                  })}
                </div>

                {/* tokens */}
                {[...cellTokens.entries()].map(([key, list]) =>
                  list.map((entry, i) => {
                    const { player, piece } = entry;
                    const cnt = list.length;
                    // cluster within the cell (up to 2×2-ish), then shrink for crowds
                    const cols = cnt <= 1 ? 1 : 2;
                    const gx = (i % cols) - (cols - 1) / 2;
                    const gy = Math.floor(i / cols) - (Math.ceil(cnt / cols) - 1) / 2;
                    const cellPct = 100 / SIZE;
                    const spread = cnt > 1 ? 4 : 0;
                    const left = (piece.col! + 0.5) * cellPct + gx * spread;
                    const top = (piece.row! + 0.5) * cellPct + gy * spread;
                    const mine = player.username === myName;
                    const movable = mine && myLegal.includes(piece.id);
                    const w = cnt > 4 ? 6.5 : cnt > 1 ? 8.5 : 11;       // width %
                    const h = w * 1.22;                                  // pawns are taller
                    const uid = `${player.color}-${piece.id}`;
                    const anim = anims.get(uid);
                    // Walking along the path takes priority over the resting spring.
                    const animateProp = anim
                      ? { left: anim.left, top: anim.top }
                      : { left: `${left}%`, top: `${top}%`, scale: movable ? [1, 1.12, 1] : 1 };
                    const transitionProp = anim
                      ? { left: { duration: anim.ms / 1000, ease: 'linear' as const }, top: { duration: anim.ms / 1000, ease: 'linear' as const } }
                      : { left: { type: 'spring' as const, stiffness: 320, damping: 30 }, top: { type: 'spring' as const, stiffness: 320, damping: 30 }, scale: { repeat: movable ? Infinity : 0, duration: 1 } };
                    return (
                      <motion.button
                        key={uid}
                        initial={false}
                        animate={animateProp}
                        transition={transitionProp}
                        onClick={() => onPieceClick(piece.id)}
                        disabled={!movable}
                        style={{ width: `${w}%`, height: `${h}%`, marginLeft: `-${w / 2}%`, marginTop: `-${h * 0.62}%` }}
                        className={`absolute flex items-end justify-center ${anim ? 'z-40' : movable ? 'cursor-pointer z-30' : 'z-10'} disabled:cursor-default`}
                        title={`${disp(player.username)} · piece ${piece.id + 1}`}
                      >
                        {/* selectable glow halo */}
                        {movable && (
                          <span className={`absolute bottom-0 left-1/2 -translate-x-1/2 w-3/4 h-1/3 rounded-full blur-[3px] ${COLOR[player.color].dot} opacity-70 animate-pulse`} />
                        )}
                        <Pawn color={player.color} uid={uid} dim={key === '2-2'} />
                      </motion.button>
                    );
                  }),
                )}
              </div>

              {/* ════ CONTROLS ════ */}
              <div className="flex items-center justify-center gap-4 sm:gap-6">
                {/* animated cowrie dice — tap to roll */}
                <CowrieDice roll={shownRoll} rolling={rolling} canRoll={canRoll} onRoll={() => canRoll && chowkaRoll(roomId)} />

                {/* turn / action */}
                <div className="flex flex-col items-stretch gap-2 min-w-[150px]">
                  <div className="text-center text-sm">
                    {state.winner ? (
                      <span className="font-semibold text-text-primary">Game over</span>
                    ) : isMyTurn ? (
                      <span className="font-semibold text-emerald-400">{state.awaitingMove ? 'Pick a glowing piece' : 'Your turn'}</span>
                    ) : (
                      <span className="text-text-secondary">{disp(state.currentTurn)}’s turn…</span>
                    )}
                  </div>
                  <button onClick={() => chowkaRoll(roomId)} disabled={!canRoll}
                    className="h-12 rounded-xl bg-gradient-to-r from-orange-500 to-rose-600 text-white font-semibold shadow-lg hover:opacity-90 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-2">
                    <Dices className="w-5 h-5" /> {rolling ? 'Rolling…' : 'Roll'}
                  </button>
                  {canMove && <p className="text-[11px] text-text-muted text-center">Rolled {state.lastRoll} — tap a highlighted piece</p>}
                </div>
              </div>

              <div className="flex items-center justify-center gap-4 text-[11px] text-text-muted">
                <span className="flex items-center gap-1"><span className="text-accent-purple">✦</span> safe square</span>
                <span className="flex items-center gap-1"><Shield className="w-3 h-3" /> no capture on safe</span>
                <span className="flex items-center gap-1"><Sparkles className="w-3 h-3" /> 4 / 8 = bonus roll</span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Chat drawer */}
      <AnimatePresence>
        {chatOpen && (
          <motion.div initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} transition={{ type: 'tween', duration: 0.25 }}
            className="fixed top-0 right-0 bottom-0 w-full max-w-xs bg-bg-secondary border-l border-border-color z-50 flex flex-col shadow-2xl">
            <div className="h-14 px-4 flex items-center justify-between border-b border-border-color shrink-0">
              <span className="font-semibold text-text-primary flex items-center gap-2"><MessageCircle className="w-4 h-4" /> Room chat</span>
              <button onClick={() => setChatOpen(false)} className="p-1.5 hover:bg-hover-bg rounded-lg text-text-muted"><X className="w-4 h-4" /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2">
              {chat.length === 0 && <p className="text-center text-xs text-text-muted mt-4">No messages yet.</p>}
              {chat.map((m, i) => (
                <div key={i} className={`text-sm ${m.sender === myName ? 'text-right' : ''}`}>
                  <span className="text-[10px] text-text-muted block">{disp(m.sender)}</span>
                  <span className="inline-block px-2.5 py-1.5 rounded-xl bg-bg-tertiary text-text-primary">{m.message}</span>
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>
            <div className="p-3 border-t border-border-color flex gap-2 shrink-0">
              <input value={chatInput} onChange={(e) => setChatInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && sendChat()}
                placeholder="Message…" className="flex-1 h-10 px-3 rounded-xl bg-bg-tertiary border border-border-color text-sm text-text-primary outline-none focus:border-accent-orange/50" />
              <button onClick={sendChat} className="w-10 h-10 rounded-xl bg-accent-orange text-white flex items-center justify-center"><Send className="w-4 h-4" /></button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Toasts */}
      <div className="fixed top-16 left-1/2 -translate-x-1/2 z-[55] flex flex-col items-center gap-2 pointer-events-none">
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div key={t.id} initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }}
              className={`px-3.5 py-2 rounded-xl text-sm font-medium shadow-lg border ${
                t.kind === 'error' ? 'bg-red-500/15 border-red-500/40 text-red-300'
                : t.kind === 'good' ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                : 'bg-bg-secondary border-border-color text-text-secondary'}`}>
              {t.text}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Confirm leave (mid-game) */}
      <AnimatePresence>
        {confirmLeave && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[65] flex items-center justify-center p-4" onClick={() => setConfirmLeave(false)}>
            <motion.div initial={{ scale: 0.92, y: 16 }} animate={{ scale: 1, y: 0 }} onClick={(e) => e.stopPropagation()}
              className="bg-bg-secondary border border-border-color rounded-2xl w-full max-w-xs shadow-2xl p-6 text-center">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/15 flex items-center justify-center mx-auto mb-3">
                <ArrowLeft className="w-6 h-6 text-amber-400" />
              </div>
              <h3 className="font-bold text-text-primary">Leave the game?</h3>
              <p className="text-sm text-text-secondary mt-1.5">It’s still in progress. Your pieces stay on the board — you can rejoin with the code <span className="font-mono text-text-primary">{roomId}</span>.</p>
              <div className="flex gap-3 mt-5">
                <button onClick={() => setConfirmLeave(false)} className="flex-1 h-11 rounded-xl bg-gradient-to-r from-orange-500 to-rose-600 text-white font-semibold shadow-lg hover:opacity-90">Keep playing</button>
                <button onClick={doLeave} className="flex-1 h-11 rounded-xl border border-border-color text-text-secondary hover:bg-hover-bg font-medium">Leave</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Game over modal */}
      <AnimatePresence>
        {gameOver && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
            <motion.div initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }}
              className="bg-bg-secondary border border-border-color rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden">
              <div className="h-1.5 bg-gradient-to-r from-orange-500 to-rose-600" />
              <div className="p-6 flex flex-col items-center text-center">
                <Trophy className="w-12 h-12 text-yellow-500 mb-2" />
                <h3 className="text-xl font-bold text-text-primary">{gameOver.winner === myName ? 'You win! 🎉' : `${disp(gameOver.winner)} wins!`}</h3>
                <div className="w-full mt-4 flex flex-col gap-1.5">
                  {gameOver.standings.map((s) => (
                    <div key={s.username} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-bg-tertiary">
                      <span className="w-6 text-center font-bold text-sm">{s.rank === 1 ? '🥇' : s.rank === 2 ? '🥈' : s.rank === 3 ? '🥉' : `#${s.rank}`}</span>
                      <span className={`w-2.5 h-2.5 rounded-full ${COLOR[s.color as Color]?.dot || 'bg-text-muted'}`} />
                      <span className="flex-1 text-left text-sm text-text-primary truncate">{disp(s.username)}</span>
                      <span className="text-xs text-text-muted">{s.homed}/4 home</span>
                    </div>
                  ))}
                </div>
                <div className="flex gap-3 mt-6 w-full">
                  <button onClick={leave} className="flex-1 h-11 rounded-xl border border-border-color text-text-secondary hover:bg-hover-bg font-medium">Exit</button>
                  {isHost && (
                    <button onClick={() => chowkaRematch(roomId)} className="flex-1 h-11 rounded-xl bg-gradient-to-r from-orange-500 to-rose-600 text-white font-semibold shadow-lg hover:opacity-90 flex items-center justify-center gap-2">
                      <RotateCcw className="w-4 h-4" /> Rematch
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const CHOWKA_RULES = [
  'Each player has 4 pieces. Take turns rolling the four cowrie shells (1–4, or 8).',
  'In traditional start, roll a 1, 4 or 8 to bring a piece out of base onto your start square.',
  'Pieces travel the outer ring, then the inner ring, then into the centre. You can’t overshoot the centre.',
  'Land exactly on an opponent (not on a ✦ safe square) to send their piece back to base.',
  'Rolling a 4 or 8, capturing, or sending a piece home all earn you a bonus roll.',
  'First player to bring all 4 pieces to the centre home wins!',
];
