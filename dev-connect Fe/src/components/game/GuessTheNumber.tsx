import { useState, useEffect, useRef, useCallback } from 'react';
import {
  ArrowLeft, Hash, Send, Trophy, Handshake, ChevronUp, ChevronDown, CheckCircle,
  Copy, Users, Dices, Target, Loader2, MessageCircle, RotateCcw, Timer, X, Crown,
} from 'lucide-react';
import { Button } from '../common/Button';
import { subscribe } from '../../services/stompClient';
import { gameJoinRoom, gameSelectNumber, gameGuess, gameChat, gameRematch } from '../../services/stompClient';
import { GameAPI } from '../../services/api';
import { GameInviteButton } from './GameInviteButton';

type GamePhase = 'lobby' | 'waiting' | 'selecting' | 'toss' | 'playing' | 'result';
type Difficulty = 'EASY' | 'MEDIUM' | 'HARD';

interface GuessEntry { player: string; guess: number; hint: string }
interface ChatMsg { sender: string; message: string }
interface LeaderboardEntry { username: string; wins: number; losses: number; draws: number; totalGames: number }

const DIFF_CONFIG: Record<Difficulty, { label: string; range: string; min: number; max: number; color: string }> = {
  EASY: { label: 'Easy', range: '1 – 50', min: 1, max: 50, color: 'from-green-500 to-emerald-500' },
  MEDIUM: { label: 'Medium', range: '1 – 100', min: 1, max: 100, color: 'from-amber-500 to-orange-500' },
  HARD: { label: 'Hard', range: '1 – 1000', min: 1, max: 1000, color: 'from-red-500 to-rose-600' },
};

export const GuessTheNumber = ({ currentUser, onBack, initialRoomId }: { currentUser: any; onBack: () => void; initialRoomId?: string }) => {
  // Game state
  const [phase, setPhase] = useState<GamePhase>('lobby');
  const [roomId, setRoomId] = useState('');
  const [difficulty, setDifficulty] = useState<Difficulty>('MEDIUM');
  const [rangeMin, setRangeMin] = useState(1);
  const [rangeMax, setRangeMax] = useState(100);
  const [player1, setPlayer1] = useState('');
  const [player2, setPlayer2] = useState('');
  const [currentTurn, setCurrentTurn] = useState('');
  const [myNumber, setMyNumber] = useState<number | null>(null);
  const [p1Attempts, setP1Attempts] = useState(0);
  const [p2Attempts, setP2Attempts] = useState(0);
  const [guessHistory, setGuessHistory] = useState<GuessEntry[]>([]);
  const [winner, setWinner] = useState<string | null>(null);
  const [resultMessage, setResultMessage] = useState('');
  const [tossMessage, setTossMessage] = useState('');
  const [tossAnimating, setTossAnimating] = useState(false);

  // UI state
  const [roomInput, setRoomInput] = useState('');
  const [numberInput, setNumberInput] = useState('');
  const [guessInput, setGuessInput] = useState('');
  const [chatInput, setChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState<ChatMsg[]>([]);
  const [chatOpen, setChatOpen] = useState(false);
  const [unreadChat, setUnreadChat] = useState(0);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [lastHint, setLastHint] = useState<string | null>(null);
  const [rematchRequested, setRematchRequested] = useState(false);
  const [opponentWantsRematch, setOpponentWantsRematch] = useState(false);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);

  // Timer
  const [timeLeft, setTimeLeft] = useState(0);
  const [turnDuration, setTurnDuration] = useState(10);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const historyEndRef = useRef<HTMLDivElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const guessInputRef = useRef<HTMLInputElement>(null);
  const username = currentUser?.username || '';

  const opponentName = player1 === username ? player2 : player1;
  const isMyTurn = currentTurn === username;
  const myAttempts = player1 === username ? p1Attempts : p2Attempts;
  const oppAttempts = player1 === username ? p2Attempts : p1Attempts;

  // Auto-scroll
  useEffect(() => { historyEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [guessHistory]);
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [chatMessages]);

  // Focus guess input on turn
  useEffect(() => {
    if (isMyTurn && phase === 'playing') guessInputRef.current?.focus();
  }, [isMyTurn, phase]);

  // Timer
  const startTimer = useCallback((seconds?: number) => {
    if (timerRef.current) clearInterval(timerRef.current);
    const duration = seconds || turnDuration;
    if (seconds) setTurnDuration(seconds);
    setTimeLeft(duration);
    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, [turnDuration]);

  const stopTimer = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }, []);

  useEffect(() => () => stopTimer(), [stopTimer]);

  // ── WebSocket Subscriptions ──
  useEffect(() => {
    if (!roomId) return;
    let cancelled = false;
    let sub: any = null;

    subscribe(`/topic/game/${roomId}`, (msg: any) => {
      if (cancelled) return;
      console.log('[Game]', msg.type, msg);

      switch (msg.type) {
        case 'JOIN_ROOM':
          if (msg.status === 'NUMBER_SELECTION') {
            setPlayer1(msg.player1 || '');
            setPlayer2(msg.player2 || '');
            setPhase('selecting');
          }
          break;

        case 'START_GAME': {
          const timeout = msg.turnTimeoutSeconds || 10;
          setPlayer1(msg.player1 || '');
          setPlayer2(msg.player2 || '');
          setCurrentTurn(msg.currentTurnPlayer || '');
          setTossMessage(msg.message || '');
          setTossAnimating(true);
          setTurnDuration(timeout);
          setPhase('toss');
          setTimeout(() => {
            setTossAnimating(false);
            setPhase('playing');
            startTimer(timeout);
          }, 3000);
          break;
        }

        case 'GUESS_RESULT':
          setGuessHistory(prev => [...prev, { player: msg.player, guess: msg.guess, hint: msg.hint }]);
          setP1Attempts(msg.player1Attempts ?? 0);
          setP2Attempts(msg.player2Attempts ?? 0);
          if (msg.player === username) {
            setLastHint(msg.hint);
            setTimeout(() => setLastHint(null), 3000);
          }
          break;

        case 'TURN_SWITCH':
          setCurrentTurn(msg.currentTurnPlayer || '');
          startTimer(msg.turnTimeoutSeconds);
          break;

        case 'TURN_TIMEOUT':
          stopTimer();
          setTimeLeft(0);
          break;

        case 'GAME_RESULT':
          stopTimer();
          setWinner(msg.winner || null);
          setResultMessage(msg.message || '');
          setP1Attempts(msg.player1Attempts ?? p1Attempts);
          setP2Attempts(msg.player2Attempts ?? p2Attempts);
          setPhase('result');
          break;

        case 'CHAT_MESSAGE':
          setChatMessages(prev => [...prev, { sender: msg.sender, message: msg.message }]);
          if (!chatOpen) setUnreadChat(prev => prev + 1);
          break;

        case 'REMATCH_REQUEST':
          if (msg.player !== username) setOpponentWantsRematch(true);
          break;

        case 'REMATCH_ACCEPTED':
          setPhase('selecting');
          setMyNumber(null);
          setGuessHistory([]);
          setP1Attempts(0);
          setP2Attempts(0);
          setWinner(null);
          setResultMessage('');
          setLastHint(null);
          setRematchRequested(false);
          setOpponentWantsRematch(false);
          stopTimer();
          break;
      }
    }).then(s => { sub = s; });

    return () => { cancelled = true; sub?.unsubscribe(); };
  }, [roomId]);

  // Private events
  useEffect(() => {
    if (!roomId) return;
    let cancelled = false;
    let sub: any = null;
    subscribe('/user/queue/game', (msg: any) => {
      if (cancelled) return;
      if (msg.type === 'ERROR') { setError(msg.message); setTimeout(() => setError(''), 4000); }
    }).then(s => { sub = s; });
    return () => { cancelled = true; sub?.unsubscribe(); };
  }, [roomId]);

  // ── Actions ──
  const handleCreateRoom = async () => {
    setIsCreating(true);
    setError('');
    try {
      const res = await GameAPI.createRoom(difficulty);
      const data = res.data || res;
      const id = data.roomId;
      setRoomId(id);
      setRoomInput(id);
      if (data.minRange) setRangeMin(data.minRange);
      if (data.maxRange) setRangeMax(data.maxRange);
      setPhase('waiting');
      setTimeout(() => gameJoinRoom(id), 500);
    } catch {
      setError('Failed to create room');
    } finally {
      setIsCreating(false);
    }
  };

  const handleJoinRoom = () => {
    if (!roomInput.trim()) return;
    const id = roomInput.trim();
    setRoomId(id);
    setPhase('waiting');
    setTimeout(() => gameJoinRoom(id), 500);
  };

  // Auto-join when arriving via a chat invite
  useEffect(() => {
    if (!initialRoomId) return;
    setRoomInput(initialRoomId);
    setRoomId(initialRoomId);
    setPhase('waiting');
    setTimeout(() => gameJoinRoom(initialRoomId), 500);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialRoomId]);

  const handleSelectNumber = () => {
    const num = parseInt(numberInput);
    if (isNaN(num) || num < rangeMin || num > rangeMax) return;
    setMyNumber(num);
    gameSelectNumber(roomId, num);
    setNumberInput('');
  };

  const handleGuess = (e: React.FormEvent) => {
    e.preventDefault();
    const guess = parseInt(guessInput);
    if (isNaN(guess) || guess < rangeMin || guess > rangeMax || !isMyTurn || timeLeft === 0) return;
    gameGuess(roomId, guess);
    setGuessInput('');
  };

  const handleSendChat = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    gameChat(roomId, chatInput.trim());
    setChatInput('');
  };

  const handleRematch = () => {
    setRematchRequested(true);
    gameRematch(roomId);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(roomId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const loadLeaderboard = async () => {
    setShowLeaderboard(true);
    setLeaderboardLoading(true);
    try {
      const res = await GameAPI.getLeaderboard();
      setLeaderboard(res.data || res || []);
    } catch { setLeaderboard([]); }
    finally { setLeaderboardLoading(false); }
  };

  const resetGame = () => {
    stopTimer();
    setPhase('lobby'); setRoomId(''); setRoomInput(''); setMyNumber(null);
    setCurrentTurn(''); setPlayer1(''); setPlayer2('');
    setP1Attempts(0); setP2Attempts(0); setGuessHistory([]);
    setWinner(null); setResultMessage(''); setLastHint(null); setError('');
    setChatMessages([]); setChatOpen(false); setUnreadChat(0);
    setRematchRequested(false); setOpponentWantsRematch(false);
  };

  // ═══════════════════════════════════════
  return (
    <div className="flex flex-col h-full w-full bg-bg-primary relative">
      {/* ── Header ── */}
      <header className="h-14 sm:h-20 px-3 sm:px-8 border-b border-border-color flex items-center gap-2 sm:gap-4 shrink-0 glass z-20">
        <button onClick={onBack} className="p-1.5 sm:p-2 hover:bg-bg-tertiary rounded-xl transition-colors text-text-secondary">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="w-9 h-9 sm:w-12 sm:h-12 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center shrink-0">
          <Target className="w-4 h-4 sm:w-6 sm:h-6 text-white" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="font-bold text-sm sm:text-xl leading-tight truncate">Guess the Number</h2>
          <p className="text-[10px] sm:text-sm text-text-secondary truncate">
            {phase === 'lobby' && 'Create or join a room'}
            {phase === 'waiting' && 'Waiting for opponent...'}
            {phase === 'selecting' && 'Pick your secret number'}
            {phase === 'toss' && 'Coin toss...'}
            {phase === 'playing' && (isMyTurn ? '🟢 Your turn' : `⏳ ${opponentName}'s turn`)}
            {phase === 'result' && 'Game Over'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {roomId && (
            <span className="hidden md:inline text-[10px] bg-bg-tertiary border border-border-color rounded-full px-2.5 py-1 text-text-muted font-mono">
              {roomId}
            </span>
          )}
          {phase === 'lobby' && (
            <button onClick={loadLeaderboard} className="p-2 hover:bg-bg-tertiary rounded-xl transition-colors text-text-secondary hover:text-yellow-500" title="Leaderboard">
              <Crown className="w-5 h-5" />
            </button>
          )}
          {(phase === 'playing' || phase === 'result') && (
            <button
              onClick={() => { setChatOpen(!chatOpen); if (!chatOpen) setUnreadChat(0); }}
              className="relative p-2 hover:bg-bg-tertiary rounded-xl transition-colors text-text-secondary hover:text-accent-purple"
            >
              <MessageCircle className="w-5 h-5" />
              {unreadChat > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                  {unreadChat}
                </span>
              )}
            </button>
          )}
        </div>
      </header>

      {/* ── Timer Bar (playing phase) ── */}
      {phase === 'playing' && (
        <div className="px-3 sm:px-8 py-2 border-b border-border-color flex items-center gap-3 bg-bg-secondary/50 shrink-0">
          <Timer className={`w-4 h-4 ${timeLeft <= Math.ceil(turnDuration * 0.3) ? 'text-red-500' : 'text-text-muted'}`} />
          <div className="flex-1 h-2 bg-bg-tertiary rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-1000 ${
                timeLeft <= Math.ceil(turnDuration * 0.3) ? 'bg-red-500' : timeLeft <= Math.ceil(turnDuration * 0.5) ? 'bg-amber-500' : 'bg-accent-purple'
              }`}
              style={{ width: `${(timeLeft / turnDuration) * 100}%` }}
            />
          </div>
          <span className={`text-sm font-bold min-w-[28px] text-right ${timeLeft <= Math.ceil(turnDuration * 0.3) ? 'text-red-500 animate-pulse' : 'text-text-primary'}`}>
            {timeLeft}s
          </span>
        </div>
      )}

      {/* ── Error ── */}
      {error && (
        <div className="mx-3 sm:mx-8 mt-3 bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-2.5 rounded-xl text-sm font-medium text-center">
          {error}
        </div>
      )}

      {/* ── Main Content ── */}
      <div className="flex-1 overflow-y-auto flex items-center justify-center p-3 sm:p-8">

        {/* LOBBY */}
        {phase === 'lobby' && (
          <div className="w-full max-w-lg flex flex-col gap-5 sm:gap-6">
            {/* Difficulty Picker */}
            <div className="bg-bg-secondary border border-border-color rounded-2xl p-5 sm:p-6">
              <h3 className="text-sm font-bold text-text-muted uppercase tracking-wider mb-3">Select Difficulty</h3>
              <div className="grid grid-cols-3 gap-2 sm:gap-3">
                {(Object.keys(DIFF_CONFIG) as Difficulty[]).map(d => (
                  <button
                    key={d}
                    onClick={() => { setDifficulty(d); setRangeMin(DIFF_CONFIG[d].min); setRangeMax(DIFF_CONFIG[d].max); }}
                    className={`flex flex-col items-center gap-1 p-3 sm:p-4 rounded-xl border-2 transition-all ${
                      difficulty === d
                        ? `border-transparent bg-gradient-to-br ${DIFF_CONFIG[d].color} text-white shadow-lg`
                        : 'border-border-color bg-bg-tertiary text-text-secondary hover:border-text-muted'
                    }`}
                  >
                    <span className="font-bold text-sm sm:text-base">{DIFF_CONFIG[d].label}</span>
                    <span className={`text-[10px] sm:text-xs ${difficulty === d ? 'text-white/80' : 'text-text-muted'}`}>
                      {DIFF_CONFIG[d].range}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Create */}
            <div className="bg-bg-secondary border border-border-color rounded-2xl p-6 sm:p-8 flex flex-col items-center gap-4 sm:gap-5">
              <div className={`w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-gradient-to-br ${DIFF_CONFIG[difficulty].color} flex items-center justify-center shadow-lg`}>
                <Dices className="w-7 h-7 sm:w-8 sm:h-8 text-white" />
              </div>
              <div className="text-center">
                <h3 className="text-lg sm:text-xl font-bold text-text-primary">Start New Game</h3>
                <p className="text-text-secondary mt-1 text-xs sm:text-sm">Range: {DIFF_CONFIG[difficulty].range}</p>
              </div>
              <Button
                variant="primary" size="lg"
                className={`w-full bg-gradient-to-r ${DIFF_CONFIG[difficulty].color} border-0 rounded-xl h-12 sm:h-14 text-base font-bold`}
                onClick={handleCreateRoom} isLoading={isCreating}
              >
                Create Room
              </Button>
            </div>

            <div className="flex items-center gap-4">
              <div className="flex-1 h-px bg-border-color" />
              <span className="text-text-muted font-semibold text-xs">OR</span>
              <div className="flex-1 h-px bg-border-color" />
            </div>

            {/* Join */}
            <div className="bg-bg-secondary border border-border-color rounded-2xl p-5 sm:p-6 flex flex-col gap-3 sm:gap-4">
              <h3 className="text-base sm:text-lg font-bold text-text-primary text-center">Join a Room</h3>
              <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
                <div className="flex-1 relative">
                  <Hash className="w-4 h-4 sm:w-5 sm:h-5 absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted" />
                  <input
                    type="text" placeholder="Room ID..."
                    value={roomInput} onChange={(e) => setRoomInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleJoinRoom()}
                    className="w-full h-11 sm:h-12 bg-bg-tertiary border border-border-color rounded-xl pl-10 sm:pl-12 pr-4 text-sm sm:text-base text-text-primary focus:outline-none focus:border-accent-purple transition-colors"
                  />
                </div>
                <Button variant="primary" className="rounded-xl h-11 sm:h-12 px-6 bg-gradient-to-r from-accent-purple to-accent-hover border-0" onClick={handleJoinRoom} disabled={!roomInput.trim()}>
                  Join
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* WAITING */}
        {phase === 'waiting' && (
          <div className="w-full max-w-sm sm:max-w-md bg-bg-secondary border border-border-color rounded-2xl p-6 sm:p-10 flex flex-col items-center gap-4 sm:gap-5">
            <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-accent-purple/20 flex items-center justify-center animate-pulse">
              <Users className="w-8 h-8 sm:w-10 sm:h-10 text-accent-purple" />
            </div>
            <h3 className="text-lg sm:text-2xl font-bold text-text-primary">Waiting for Opponent</h3>
            <p className="text-text-secondary text-xs sm:text-sm text-center">Share this Room ID</p>
            <button onClick={handleCopy}
              className="flex items-center gap-2 bg-bg-tertiary border border-border-color rounded-xl px-4 sm:px-6 py-3 hover:border-accent-purple transition-colors w-full justify-center">
              <span className="font-mono font-bold text-sm sm:text-lg text-text-primary truncate">{roomId}</span>
              {copied ? <CheckCircle className="w-4 h-4 text-green-500 shrink-0" /> : <Copy className="w-4 h-4 text-text-muted shrink-0" />}
            </button>
            {copied && <span className="text-xs text-green-500">Copied!</span>}
            <GameInviteButton currentUser={currentUser} kind="guess" roomId={roomId} label="Guess the Number" />
            <div className="flex gap-1.5 mt-1">
              {[0, 150, 300].map(d => <div key={d} className="w-2 h-2 rounded-full bg-accent-purple animate-bounce" style={{ animationDelay: `${d}ms` }} />)}
            </div>
          </div>
        )}

        {/* SELECTING */}
        {phase === 'selecting' && (
          <div className="w-full max-w-sm sm:max-w-md bg-bg-secondary border border-border-color rounded-2xl p-6 sm:p-10 flex flex-col items-center gap-4 sm:gap-5">
            <div className={`w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-gradient-to-br ${DIFF_CONFIG[difficulty].color} flex items-center justify-center shadow-lg`}>
              <Hash className="w-7 h-7 sm:w-8 sm:h-8 text-white" />
            </div>
            {myNumber ? (
              <>
                <h3 className="text-lg sm:text-2xl font-bold text-text-primary">Number Locked!</h3>
                <p className={`text-4xl sm:text-6xl font-extrabold bg-clip-text text-transparent bg-gradient-to-r ${DIFF_CONFIG[difficulty].color}`}>
                  {myNumber}
                </p>
                <p className="text-text-secondary text-xs sm:text-sm">Waiting for {opponentName || 'opponent'}...</p>
                <Loader2 className="w-5 h-5 text-accent-purple animate-spin" />
              </>
            ) : (
              <>
                <h3 className="text-lg sm:text-xl font-bold text-text-primary">Pick Your Secret Number</h3>
                <p className="text-text-secondary text-xs sm:text-sm">Range: {rangeMin} – {rangeMax}</p>
                <input
                  type="number" min={rangeMin} max={rangeMax}
                  placeholder={`${rangeMin} – ${rangeMax}`}
                  value={numberInput} onChange={(e) => setNumberInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSelectNumber()}
                  className="w-full h-14 sm:h-16 bg-bg-tertiary border border-border-color rounded-xl px-6 text-center text-2xl sm:text-3xl font-bold text-text-primary focus:outline-none focus:border-amber-500 transition-colors"
                />
                <Button variant="primary" size="lg"
                  className={`w-full bg-gradient-to-r ${DIFF_CONFIG[difficulty].color} border-0 rounded-xl h-12 sm:h-14 text-base font-bold`}
                  onClick={handleSelectNumber}
                  disabled={!numberInput || parseInt(numberInput) < rangeMin || parseInt(numberInput) > rangeMax}>
                  Lock In
                </Button>
              </>
            )}
          </div>
        )}

        {/* TOSS */}
        {phase === 'toss' && (
          <div className="flex flex-col items-center gap-5 sm:gap-8">
            <div className={`w-24 h-24 sm:w-32 sm:h-32 rounded-full bg-gradient-to-br from-yellow-400 to-amber-600 flex items-center justify-center shadow-2xl ${tossAnimating ? 'animate-spin' : ''}`}>
              <Dices className="w-12 h-12 sm:w-16 sm:h-16 text-white" />
            </div>
            {tossAnimating
              ? <h2 className="text-xl sm:text-3xl font-extrabold text-text-primary animate-pulse">Flipping Coin...</h2>
              : <h2 className="text-xl sm:text-3xl font-extrabold text-text-primary text-center px-4">{tossMessage}</h2>
            }
          </div>
        )}

        {/* PLAYING */}
        {phase === 'playing' && (
          <div className="w-full max-w-2xl flex flex-col gap-3 sm:gap-5 self-start">
            {/* Players */}
            <div className="grid grid-cols-2 gap-2 sm:gap-4">
              {/* You */}
              <div className={`bg-bg-secondary border-2 rounded-xl p-3 sm:p-5 flex flex-col items-center gap-1.5 sm:gap-2 transition-all ${
                isMyTurn ? 'border-accent-purple shadow-lg shadow-accent-purple/10' : 'border-border-color'
              }`}>
                <div className="w-9 h-9 sm:w-12 sm:h-12 rounded-full bg-gradient-to-br from-accent-purple to-accent-hover flex items-center justify-center text-white text-base sm:text-xl font-bold uppercase">
                  {username.charAt(0)}
                </div>
                <span className="font-bold text-xs sm:text-base text-text-primary truncate max-w-full">You</span>
                <span className="text-[10px] sm:text-xs bg-bg-tertiary rounded-full px-2 py-0.5 font-semibold">{myAttempts} tries</span>
                {isMyTurn && <span className="text-[9px] sm:text-[10px] font-bold text-accent-purple bg-accent-purple/10 px-2 py-0.5 rounded-full animate-pulse">YOUR TURN</span>}
              </div>
              {/* Opponent */}
              <div className={`bg-bg-secondary border-2 rounded-xl p-3 sm:p-5 flex flex-col items-center gap-1.5 sm:gap-2 transition-all ${
                !isMyTurn ? 'border-accent-orange shadow-lg shadow-accent-orange/10' : 'border-border-color'
              }`}>
                <div className="w-9 h-9 sm:w-12 sm:h-12 rounded-full bg-gradient-to-br from-accent-orange to-red-500 flex items-center justify-center text-white text-base sm:text-xl font-bold uppercase">
                  {(opponentName || '?').charAt(0)}
                </div>
                <span className="font-bold text-xs sm:text-base text-text-primary truncate max-w-full">{opponentName}</span>
                <span className="text-[10px] sm:text-xs bg-bg-tertiary rounded-full px-2 py-0.5 font-semibold">{oppAttempts} tries</span>
                {!isMyTurn && <span className="text-[9px] sm:text-[10px] font-bold text-accent-orange bg-accent-orange/10 px-2 py-0.5 rounded-full animate-pulse">THEIR TURN</span>}
              </div>
            </div>

            {/* Timeout message */}
            {timeLeft === 0 && isMyTurn && (
              <div className="bg-red-500/10 border border-red-500/20 text-red-400 py-2.5 px-4 rounded-xl text-sm font-bold text-center animate-pulse">
                ⏳ Time's up! Turn skipped.
              </div>
            )}

            {/* Hint */}
            {lastHint && (
              <div className={`flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-sm sm:text-base font-bold ${
                lastHint === 'Too High' ? 'bg-red-500/10 text-red-400 border border-red-500/20' :
                lastHint === 'Too Low' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' :
                'bg-green-500/10 text-green-400 border border-green-500/20'
              }`}>
                {lastHint === 'Too High' && <><ChevronUp className="w-5 h-5" /> Too High!</>}
                {lastHint === 'Too Low' && <><ChevronDown className="w-5 h-5" /> Too Low!</>}
                {lastHint === 'Correct' && <><CheckCircle className="w-5 h-5" /> Correct!</>}
              </div>
            )}

            {/* History */}
            <div className="bg-bg-secondary border border-border-color rounded-xl overflow-hidden">
              <div className="px-4 py-2.5 border-b border-border-color">
                <h3 className="font-bold text-xs sm:text-sm text-text-primary">Guess History</h3>
              </div>
              <div className="max-h-40 sm:max-h-56 overflow-y-auto p-2 sm:p-3 flex flex-col gap-1.5">
                {guessHistory.length === 0 ? (
                  <p className="text-center text-text-muted py-4 text-xs sm:text-sm">{isMyTurn ? 'Make the first guess!' : 'Waiting...'}</p>
                ) : guessHistory.map((e, i) => {
                  const isMe = e.player === username;
                  return (
                    <div key={i} className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs sm:text-sm ${
                      isMe ? 'bg-accent-purple/5 border border-accent-purple/10' : 'bg-accent-orange/5 border border-accent-orange/10'
                    }`}>
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold text-white shrink-0 ${isMe ? 'bg-accent-purple' : 'bg-accent-orange'}`}>
                        {e.player.charAt(0).toUpperCase()}
                      </div>
                      <span className="font-semibold text-text-primary truncate">{isMe ? 'You' : e.player}</span>
                      <span className="font-mono font-bold text-base text-text-primary ml-auto">{e.guess}</span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${
                        e.hint === 'Too High' ? 'bg-red-500/10 text-red-400' : e.hint === 'Too Low' ? 'bg-blue-500/10 text-blue-400' : 'bg-green-500/10 text-green-400'
                      }`}>
                        {e.hint === 'Too High' ? '🔼 High' : e.hint === 'Too Low' ? '🔽 Low' : '✅'}
                      </span>
                    </div>
                  );
                })}
                <div ref={historyEndRef} />
              </div>
            </div>

            {/* Guess Input */}
            <div className="bg-bg-secondary border border-border-color rounded-xl p-3 sm:p-4">
              <form onSubmit={handleGuess} className="flex items-center gap-2 sm:gap-3">
                <input
                  ref={guessInputRef}
                  type="number" min={rangeMin} max={rangeMax}
                  placeholder={isMyTurn && timeLeft > 0 ? `Guess (${rangeMin}–${rangeMax})` : 'Wait...'}
                  value={guessInput} onChange={(e) => setGuessInput(e.target.value)}
                  disabled={!isMyTurn || timeLeft === 0}
                  className={`flex-1 h-11 sm:h-12 bg-bg-tertiary border border-border-color rounded-xl px-4 text-sm sm:text-base font-semibold text-text-primary focus:outline-none min-w-0 transition-colors ${
                    isMyTurn && timeLeft > 0 ? 'focus:border-accent-purple' : 'opacity-40 cursor-not-allowed'
                  }`}
                />
                <Button type="submit" variant="primary"
                  className="rounded-xl h-11 sm:h-12 px-4 sm:px-6 bg-gradient-to-r from-accent-purple to-accent-hover border-0 font-bold shrink-0"
                  disabled={!isMyTurn || !guessInput || timeLeft === 0}>
                  <Send className="w-4 h-4 sm:w-5 sm:h-5" />
                </Button>
              </form>
            </div>
          </div>
        )}

        {/* RESULT */}
        {phase === 'result' && (
          <div className="w-full max-w-sm sm:max-w-md bg-bg-secondary border border-border-color rounded-2xl p-6 sm:p-10 flex flex-col items-center gap-4 sm:gap-5">
            {!winner ? (
              <>
                <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-gradient-to-br from-gray-500 to-gray-600 flex items-center justify-center shadow-lg">
                  <Handshake className="w-8 h-8 sm:w-10 sm:h-10 text-white" />
                </div>
                <h2 className="text-xl sm:text-3xl font-extrabold text-text-primary">It's a Draw! 🤝</h2>
              </>
            ) : winner === username ? (
              <>
                <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-gradient-to-br from-yellow-400 to-amber-600 flex items-center justify-center shadow-2xl animate-bounce">
                  <Trophy className="w-8 h-8 sm:w-10 sm:h-10 text-white" />
                </div>
                <h2 className="text-xl sm:text-3xl font-extrabold bg-clip-text text-transparent bg-gradient-to-r from-yellow-400 to-amber-600">You Won! 🎉</h2>
              </>
            ) : (
              <>
                <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-gradient-to-br from-gray-600 to-gray-700 flex items-center justify-center shadow-lg">
                  <Target className="w-8 h-8 sm:w-10 sm:h-10 text-gray-400" />
                </div>
                <h2 className="text-xl sm:text-3xl font-extrabold text-text-primary">{winner} Wins</h2>
              </>
            )}
            <p className="text-text-secondary text-xs sm:text-sm text-center">{resultMessage}</p>

            <div className="grid grid-cols-2 gap-3 w-full">
              <div className="bg-bg-tertiary border border-border-color rounded-xl p-3 sm:p-4 text-center">
                <p className="text-[10px] sm:text-xs text-text-muted">You</p>
                <p className="text-xl sm:text-2xl font-extrabold text-accent-purple">{myAttempts}</p>
              </div>
              <div className="bg-bg-tertiary border border-border-color rounded-xl p-3 sm:p-4 text-center">
                <p className="text-[10px] sm:text-xs text-text-muted">{opponentName}</p>
                <p className="text-xl sm:text-2xl font-extrabold text-accent-orange">{oppAttempts}</p>
              </div>
            </div>

            {/* Rematch */}
            {opponentWantsRematch && !rematchRequested && (
              <div className="bg-green-500/10 border border-green-500/20 text-green-400 px-4 py-2.5 rounded-xl text-sm font-medium text-center w-full">
                {opponentName} wants a rematch!
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 w-full mt-1">
              <Button variant="outline" className="flex-1 rounded-xl h-11 sm:h-12" onClick={onBack}>Back</Button>
              <Button variant="primary"
                className={`flex-1 rounded-xl h-11 sm:h-12 border-0 font-bold flex items-center justify-center gap-2 ${
                  rematchRequested ? 'bg-gray-600 cursor-not-allowed' : 'bg-gradient-to-r from-green-500 to-emerald-600'
                }`}
                onClick={handleRematch} disabled={rematchRequested}>
                <RotateCcw className="w-4 h-4" />
                {rematchRequested ? 'Waiting...' : 'Rematch'}
              </Button>
              <Button variant="primary"
                className="flex-1 rounded-xl h-11 sm:h-12 bg-gradient-to-r from-accent-purple to-accent-hover border-0 font-bold"
                onClick={resetGame}>
                New Game
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* ── Chat Side Panel ── */}
      {chatOpen && (phase === 'playing' || phase === 'result') && (
        <div className="absolute right-0 top-14 sm:top-20 bottom-0 w-full sm:w-80 bg-bg-secondary border-l border-border-color flex flex-col z-30 shadow-2xl">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border-color">
            <h3 className="font-bold text-sm text-text-primary flex items-center gap-2">
              <MessageCircle className="w-4 h-4 text-accent-purple" /> Game Chat
            </h3>
            <button onClick={() => setChatOpen(false)} className="p-1 hover:bg-bg-tertiary rounded-lg transition-colors text-text-muted">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2">
            {chatMessages.length === 0 && (
              <p className="text-center text-text-muted text-xs py-8">No messages yet</p>
            )}
            {chatMessages.map((m, i) => {
              const isMe = m.sender === username;
              return (
                <div key={i} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] px-3 py-2 rounded-2xl text-xs sm:text-sm ${
                    isMe
                      ? 'bg-gradient-to-br from-accent-purple to-accent-hover text-white rounded-tr-sm'
                      : 'bg-bg-tertiary border border-border-color text-text-primary rounded-tl-sm'
                  }`}>
                    {!isMe && <p className="text-[10px] font-bold text-accent-orange mb-0.5">{m.sender}</p>}
                    <p>{m.message}</p>
                  </div>
                </div>
              );
            })}
            <div ref={chatEndRef} />
          </div>
          <form onSubmit={handleSendChat} className="p-3 border-t border-border-color flex gap-2">
            <input
              type="text" placeholder="Type..."
              value={chatInput} onChange={(e) => setChatInput(e.target.value)}
              className="flex-1 h-9 bg-bg-tertiary border border-border-color rounded-lg px-3 text-xs sm:text-sm text-text-primary focus:outline-none focus:border-accent-purple min-w-0"
            />
            <Button type="submit" variant="primary" className="h-9 px-3 rounded-lg bg-accent-purple border-0 shrink-0" disabled={!chatInput.trim()}>
              <Send className="w-3.5 h-3.5" />
            </Button>
          </form>
        </div>
      )}

      {/* ── Leaderboard Modal ── */}
      {showLeaderboard && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowLeaderboard(false)}>
          <div className="bg-bg-secondary border border-border-color rounded-2xl w-full max-w-md max-h-[80vh] overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-border-color">
              <h3 className="text-lg font-bold text-text-primary flex items-center gap-2">
                <Trophy className="w-5 h-5 text-yellow-500" /> Leaderboard
              </h3>
              <button onClick={() => setShowLeaderboard(false)} className="p-1.5 hover:bg-bg-tertiary rounded-lg text-text-muted">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="overflow-y-auto max-h-[60vh]">
              {leaderboardLoading ? (
                <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-accent-purple" /></div>
              ) : leaderboard.length === 0 ? (
                <p className="text-center text-text-muted py-10 text-sm">No games played yet</p>
              ) : leaderboard.map((entry, i) => (
                <div key={entry.username} className={`flex items-center gap-3 px-5 py-4 border-b border-border-color/50 last:border-0 ${
                  entry.username === username ? 'bg-accent-purple/5' : ''
                }`}>
                  <span className="text-xl w-8 text-center">
                    {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : <span className="text-sm font-bold text-text-muted">#{i + 1}</span>}
                  </span>
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-gray-700 to-gray-600 flex items-center justify-center text-sm font-bold text-white uppercase">
                    {entry.username.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="font-semibold text-sm text-text-primary truncate block">{entry.username}</span>
                    <span className="text-[10px] text-text-muted">{entry.totalGames} games</span>
                  </div>
                  <div className="flex gap-3 text-xs font-semibold shrink-0">
                    <span className="text-green-400">{entry.wins}W</span>
                    <span className="text-red-400">{entry.losses}L</span>
                    <span className="text-text-muted">{entry.draws}D</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
