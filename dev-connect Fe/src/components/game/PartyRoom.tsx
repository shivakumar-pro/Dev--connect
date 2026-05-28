import { useState, useEffect, useRef, useCallback } from 'react';
import {
  ArrowLeft, Copy, CheckCircle, Users, Crown, Send, Timer, Trophy, Loader2,
  MessageCircle, X, RotateCcw, Play, Hash, Zap, Brain, Eye, HelpCircle,
  Sparkles, Lightbulb, Target,
} from 'lucide-react';
import { Button } from '../common/Button';
import { subscribe, isStompConnected } from '../../services/stompClient';
import { partyJoin, partyLeave, partyStart, partyAction, partyChat, partyRematch } from '../../services/stompClient';
import { PartyAPI } from '../../services/api';
import { getAvatarEmoji } from '../../utils/avatars';
import { GameInviteButton } from './GameInviteButton';

type Phase = 'lobby' | 'waiting' | 'round' | 'result' | 'gameover';

interface Player { username: string; score: number; connected: boolean; profileAvatar?: string }
interface ChatMsg { sender: string; message: string }
interface RoundResult { [player: string]: any }

const GAME_META: Record<string, { icon: React.ReactNode; color: string; desc: string }> = {
  GUESS_THE_NUMBER: { icon: <Target className="w-5 h-5" />, color: 'from-purple-500 to-pink-500', desc: 'Guess the secret number!' },
  THIS_OR_THAT:     { icon: <Zap className="w-5 h-5" />,    color: 'from-amber-500 to-orange-500', desc: 'Pick a side & predict the majority' },
  GUESS_FAVORITES:  { icon: <Sparkles className="w-5 h-5" />, color: 'from-pink-500 to-rose-500', desc: 'Guess what your friends pick' },
  BLUFF:            { icon: <Eye className="w-5 h-5" />,     color: 'from-red-500 to-rose-600', desc: 'Find the liar!' },
  QUICK_QUIZ:       { icon: <Lightbulb className="w-5 h-5" />, color: 'from-green-500 to-emerald-500', desc: 'Speed matters — fastest wins' },
  PREDICT_ME:       { icon: <HelpCircle className="w-5 h-5" />, color: 'from-cyan-500 to-blue-500', desc: 'Predict your friends\' answers' },
  MEMORY_GAME:      { icon: <Brain className="w-5 h-5" />,   color: 'from-violet-500 to-purple-600', desc: 'Remember all the items!' },
  SECRET_HINT:      { icon: <Hash className="w-5 h-5" />,    color: 'from-teal-500 to-cyan-600', desc: 'Give hints, guess the word' },
};

export const PartyRoom = ({ currentUser, onBack, initialGameType, initialRoomId }: { currentUser: any; onBack: () => void; initialGameType?: string; initialRoomId?: string }) => {
  const username = currentUser?.username || '';

  // Room state
  const [phase, setPhase] = useState<Phase>('lobby');
  const [roomId, setRoomId] = useState('');
  const [roomInput, setRoomInput] = useState('');
  const [gameType] = useState(initialGameType || 'THIS_OR_THAT');
  const [players, setPlayers] = useState<Player[]>([]);
  const [hostUsername, setHostUsername] = useState('');
  const [maxRounds, setMaxRounds] = useState(3);
  const [timerSeconds, setTimerSeconds] = useState(15);
  const [maxPlayers, setMaxPlayers] = useState(2);
  const [currentRound, setCurrentRound] = useState(0);

  // Round state
  const [roundData, setRoundData] = useState<any>(null);
  const [roundResults, setRoundResults] = useState<RoundResult | null>(null);
  const [scoreboard, setScoreboard] = useState<Player[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const [timeLeft, setTimeLeft] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Game over
  const [winner, setWinner] = useState('');
  const [finalScoreboard, setFinalScoreboard] = useState<Player[]>([]);
  const [rematchRequested, setRematchRequested] = useState(false);
  const [rematchPlayers, setRematchPlayers] = useState<string[]>([]);

  // UI
  const [copied, setCopied] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState('');
  const [chatMessages, setChatMessages] = useState<ChatMsg[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatOpen, setChatOpen] = useState(false);
  const [unreadChat, setUnreadChat] = useState(0);
  const [openRooms, setOpenRooms] = useState<any[]>([]);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const isHost = hostUsername === username;

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [chatMessages]);

  // Timer
  const startTimer = useCallback((seconds: number) => {
    if (timerRef.current) clearInterval(timerRef.current);
    setTimeLeft(seconds);
    timerRef.current = setInterval(() => {
      setTimeLeft(prev => { if (prev <= 1) { clearInterval(timerRef.current!); return 0; } return prev - 1; });
    }, 1000);
  }, []);
  const stopTimer = useCallback(() => { if (timerRef.current) clearInterval(timerRef.current); }, []);
  useEffect(() => () => stopTimer(), [stopTimer]);

  // Load open rooms on lobby
  useEffect(() => {
    if (phase === 'lobby') {
      PartyAPI.listRooms().then(res => setOpenRooms(res.data || res || [])).catch(() => {});
    }
  }, [phase]);

  // Subscribe to room events
  useEffect(() => {
    if (!roomId) return;
    let cancelled = false;
    let sub1: any = null;
    let sub2: any = null;

    subscribe(`/topic/party/${roomId}`, (msg: any) => {
      if (cancelled) return;
      handleEvent(msg);
    }).then(s => { sub1 = s; });

    subscribe('/user/queue/party', (msg: any) => {
      if (cancelled) return;
      handleEvent(msg);
    }).then(s => { sub2 = s; });

    return () => { cancelled = true; sub1?.unsubscribe(); sub2?.unsubscribe(); stopTimer(); };
  }, [roomId]);

  const handleEvent = useCallback((msg: any) => {
    console.log('[Party]', msg.type, msg);
    switch (msg.type) {
      case 'PLAYER_JOINED':
        setPlayers(msg.players || []);
        if (msg.hostUsername) setHostUsername(msg.hostUsername);
        if (phase === 'lobby') setPhase('waiting');
        break;
      case 'PLAYER_LEFT':
        setPlayers(msg.players || []);
        break;
      case 'GAME_STARTED':
        setPhase('round');
        setCurrentRound(0);
        break;
      case 'ROUND_START':
        setRoundData(msg.roundData || msg);
        setCurrentRound(msg.round || currentRound + 1);
        setSubmitted(false);
        setRoundResults(null);
        setPhase('round');
        startTimer(msg.timerSeconds || timerSeconds);
        break;
      case 'ACTION_ACK':
        setSubmitted(true);
        break;
      case 'TIMER_EXPIRED':
        stopTimer();
        setTimeLeft(0);
        break;
      case 'ROUND_RESULT':
        stopTimer();
        setRoundResults(msg.results || msg.playerResults || null);
        setScoreboard(msg.scoreboard || []);
        setPhase('result');
        break;
      case 'GAME_OVER':
        stopTimer();
        setWinner(msg.winner || '');
        setFinalScoreboard(msg.scoreboard || []);
        setPhase('gameover');
        break;
      case 'CHAT_MESSAGE':
        setChatMessages(prev => [...prev, { sender: msg.sender, message: msg.message }]);
        if (!chatOpen) setUnreadChat(prev => prev + 1);
        break;
      case 'REMATCH_REQUEST':
        setRematchPlayers(prev => [...new Set([...prev, msg.player || msg.message])]);
        break;
      case 'REMATCH_ACCEPTED':
        setPhase('waiting');
        setRoundData(null);
        setRoundResults(null);
        setSubmitted(false);
        setRematchRequested(false);
        setRematchPlayers([]);
        setCurrentRound(0);
        break;
      case 'ERROR':
        setError(msg.message || 'Something went wrong');
        setTimeout(() => setError(''), 4000);
        break;
    }
  }, [phase, chatOpen, timerSeconds]);

  // Actions
  const handleCreateRoom = async () => {
    setIsCreating(true); setError('');
    try {
      const res = await PartyAPI.createRoom({ gameType, maxRounds, timerSeconds, maxPlayers });
      const data = res.data || res;
      console.log('[Party] Room created:', data.roomId);
      setRoomId(data.roomId);
      setHostUsername(username);
      setPhase('waiting');
      // Wait for STOMP to be ready, then join
      const joinWithRetry = (rid: string, retries = 0) => {
        if (isStompConnected()) {
          console.log('[Party] STOMP connected, joining room:', rid);
          partyJoin(rid);
        } else if (retries < 10) {
          console.log('[Party] STOMP not ready, retrying...', retries + 1);
          setTimeout(() => joinWithRetry(rid, retries + 1), 500);
        } else {
          setError('WebSocket not connected. Please refresh and try again.');
        }
      };
      setTimeout(() => joinWithRetry(data.roomId), 300);
    } catch (err) {
      console.error('[Party] Create room failed:', err);
      setError('Failed to create room. Is the backend running?');
    }
    finally { setIsCreating(false); }
  };

  const handleJoinRoom = (id?: string) => {
    const rid = (id || roomInput).trim();
    if (!rid) return;
    setRoomId(rid);
    setPhase('waiting');
    const joinWithRetry = (retries = 0) => {
      if (isStompConnected()) {
        partyJoin(rid);
      } else if (retries < 10) {
        setTimeout(() => joinWithRetry(retries + 1), 500);
      } else {
        setError('WebSocket not connected. Please refresh and try again.');
      }
    };
    setTimeout(() => joinWithRetry(), 300);
  };

  const handleCopy = () => { navigator.clipboard.writeText(roomId); setCopied(true); setTimeout(() => setCopied(false), 2000); };

  // Auto-join when arriving via a chat invite
  useEffect(() => {
    if (initialRoomId) handleJoinRoom(initialRoomId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialRoomId]);

  const handleSubmitAction = (data: any) => {
    if (submitted || !roomId) return;
    console.log('[Party] Submitting action:', JSON.stringify(data));
    partyAction(roomId, data);
  };

  const handleSendChat = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || !roomId) return;
    partyChat(roomId, chatInput.trim());
    setChatInput('');
  };

  const meta = GAME_META[gameType] || GAME_META.THIS_OR_THAT;
  const timerPct = timerSeconds > 0 ? (timeLeft / timerSeconds) * 100 : 0;
  const timerDanger = timeLeft <= Math.ceil(timerSeconds * 0.3);

  // ═══════════════════════════════════════
  return (
    <div className="flex flex-col h-full w-full bg-bg-primary relative">
      {/* Header */}
      <header className="h-14 sm:h-16 px-3 sm:px-6 border-b border-border-color flex items-center gap-2 sm:gap-3 shrink-0 glass z-20">
        <button onClick={() => { if (roomId) partyLeave(roomId); onBack(); }} className="p-1.5 hover:bg-bg-tertiary rounded-xl text-text-secondary">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className={`w-9 h-9 rounded-lg bg-gradient-to-br ${meta.color} flex items-center justify-center text-white shrink-0`}>
          {meta.icon}
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="font-bold text-sm sm:text-base truncate">{gameType.replace(/_/g, ' ')}</h2>
          <p className="text-[10px] sm:text-xs text-text-secondary truncate">
            {phase === 'lobby' ? meta.desc : phase === 'waiting' ? `${players.length} player${players.length !== 1 ? 's' : ''} in room` : phase === 'round' ? `Round ${currentRound}` : phase === 'result' ? 'Round Results' : 'Game Over'}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          {roomId && <span className="hidden sm:inline text-[10px] bg-bg-tertiary border border-border-color rounded-full px-2.5 py-1 font-mono text-text-muted">{roomId}</span>}
          {phase !== 'lobby' && (
            <button onClick={() => { setChatOpen(!chatOpen); if (!chatOpen) setUnreadChat(0); }} className="relative p-2 hover:bg-bg-tertiary rounded-xl text-text-secondary">
              <MessageCircle className="w-4 h-4" />
              {unreadChat > 0 && <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 text-white text-[8px] font-bold rounded-full flex items-center justify-center">{unreadChat}</span>}
            </button>
          )}
        </div>
      </header>

      {/* Timer bar */}
      {phase === 'round' && (
        <div className="px-3 sm:px-6 py-1.5 flex items-center gap-2 bg-bg-secondary/50 border-b border-border-color shrink-0">
          <Timer className={`w-3.5 h-3.5 ${timerDanger ? 'text-red-500' : 'text-text-muted'}`} />
          <div className="flex-1 h-1.5 bg-bg-tertiary rounded-full overflow-hidden">
            <div className={`h-full rounded-full transition-all duration-1000 ${timerDanger ? 'bg-red-500' : 'bg-accent-purple'}`} style={{ width: `${timerPct}%` }} />
          </div>
          <span className={`text-xs font-bold min-w-[24px] text-right ${timerDanger ? 'text-red-500 animate-pulse' : 'text-text-primary'}`}>{timeLeft}s</span>
        </div>
      )}

      {error && <div className="mx-3 sm:mx-6 mt-2 bg-red-500/10 border border-red-500/20 text-red-400 px-3 py-2 rounded-xl text-xs font-medium text-center">{error}</div>}

      {/* Content */}
      <div className="flex-1 overflow-y-auto flex items-center justify-center p-3 sm:p-6">

        {/* ── LOBBY ── */}
        {phase === 'lobby' && (
          <div className="w-full max-w-sm sm:max-w-md flex flex-col gap-5">
            {/* Game title card */}
            <div className="flex flex-col items-center gap-3 mb-2">
              <div className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${meta.color} flex items-center justify-center text-white shadow-lg`}>
                {meta.icon}
              </div>
              <h3 className="text-xl font-bold text-text-primary">{gameType.replace(/_/g, ' ')}</h3>
              <p className="text-sm text-text-secondary text-center">{meta.desc}</p>
            </div>

            {/* Settings + Create */}
            <div className="bg-bg-secondary border border-border-color rounded-2xl p-5 flex flex-col gap-4">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-[10px] font-bold text-text-muted uppercase mb-1 block">Rounds</label>
                  <select value={maxRounds} onChange={e => setMaxRounds(+e.target.value)} className="w-full h-10 bg-bg-tertiary border border-border-color rounded-lg px-2 text-sm text-text-primary">
                    {[3,5,7,10].map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-text-muted uppercase mb-1 block">Timer</label>
                  <select value={timerSeconds} onChange={e => setTimerSeconds(+e.target.value)} className="w-full h-10 bg-bg-tertiary border border-border-color rounded-lg px-2 text-sm text-text-primary">
                    {[10,15,20,30].map(n => <option key={n} value={n}>{n}s</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-text-muted uppercase mb-1 block">Players</label>
                  <select value={maxPlayers} onChange={e => setMaxPlayers(+e.target.value)} className="w-full h-10 bg-bg-tertiary border border-border-color rounded-lg px-2 text-sm text-text-primary">
                    {[2,4,6,8].map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
              </div>
              <Button variant="primary" size="lg" className={`w-full bg-gradient-to-r ${meta.color} border-0 rounded-xl h-12 text-base font-bold`} onClick={handleCreateRoom} isLoading={isCreating}>
                Create Room
              </Button>
            </div>

            <div className="flex items-center gap-4"><div className="flex-1 h-px bg-border-color" /><span className="text-text-muted text-xs font-semibold">OR JOIN</span><div className="flex-1 h-px bg-border-color" /></div>

            {/* Join */}
            <div className="flex gap-2">
              <input type="text" placeholder="Room ID..." value={roomInput} onChange={e => setRoomInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleJoinRoom()}
                className="flex-1 h-11 bg-bg-tertiary border border-border-color rounded-xl pl-4 pr-4 text-sm text-text-primary focus:outline-none focus:border-accent-purple" />
              <Button variant="primary" className="rounded-xl h-11 px-6 bg-gradient-to-r from-accent-purple to-accent-hover border-0" onClick={() => handleJoinRoom()} disabled={!roomInput.trim()}>Join</Button>
            </div>

            {/* Open rooms */}
            {openRooms.length > 0 && (
              <div className="bg-bg-secondary border border-border-color rounded-2xl overflow-hidden">
                <div className="px-4 py-2.5 border-b border-border-color"><h3 className="text-xs font-bold text-text-muted uppercase">Open Rooms</h3></div>
                {openRooms.slice(0, 5).map((r: any) => (
                  <div key={r.roomId} className="flex items-center gap-3 px-4 py-3 border-b border-border-color/30 last:border-0">
                    <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${GAME_META[r.gameType]?.color || 'from-gray-500 to-gray-600'} flex items-center justify-center text-white`}>
                      {GAME_META[r.gameType]?.icon || <Zap className="w-4 h-4" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-xs font-bold text-text-primary">{(r.gameType || '').replace(/_/g, ' ')}</span>
                      <span className="text-[10px] text-text-muted ml-2">{r.playerCount || '?'}/{r.maxPlayers || '?'}</span>
                    </div>
                    <Button variant="outline" size="sm" className="rounded-lg text-xs h-8 px-3" onClick={() => handleJoinRoom(r.roomId)}>Join</Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── WAITING ── */}
        {phase === 'waiting' && (
          <div className="w-full max-w-md flex flex-col items-center gap-5">
            <div className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${meta.color} flex items-center justify-center text-white shadow-lg text-2xl`}>
              {meta.icon}
            </div>
            <h3 className="text-xl font-bold text-text-primary">{gameType.replace(/_/g, ' ')}</h3>

            {/* Room ID */}
            <button onClick={handleCopy} className="flex items-center gap-2 bg-bg-tertiary border border-border-color rounded-xl px-5 py-3 hover:border-accent-purple transition-colors">
              <span className="font-mono font-bold text-sm text-text-primary">{roomId}</span>
              {copied ? <CheckCircle className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4 text-text-muted" />}
            </button>

            <GameInviteButton currentUser={currentUser} kind="party" partyKey={gameType} roomId={roomId} label={gameType.replace(/_/g, ' ')} />

            {/* Players */}
            <div className="w-full bg-bg-secondary border border-border-color rounded-2xl overflow-hidden">
              <div className="px-4 py-2.5 border-b border-border-color flex items-center justify-between">
                <h3 className="text-xs font-bold text-text-muted uppercase">Players ({players.length})</h3>
                <Users className="w-4 h-4 text-text-muted" />
              </div>
              <div className="p-3 flex flex-col gap-2">
                {players.map((p) => (
                  <div key={p.username} className="flex items-center gap-3 px-3 py-2 bg-bg-tertiary rounded-xl">
                    <div className="w-8 h-8 rounded-full bg-bg-secondary border border-border-color flex items-center justify-center text-lg">
                      {getAvatarEmoji(p.profileAvatar)}
                    </div>
                    <span className="font-semibold text-sm text-text-primary flex-1">{p.username}</span>
                    {p.username === hostUsername && <Crown className="w-4 h-4 text-yellow-500" />}
                    <div className={`w-2 h-2 rounded-full ${p.connected ? 'bg-green-500' : 'bg-gray-500'}`} />
                  </div>
                ))}
              </div>
            </div>

            {/* Start button (host only) */}
            {isHost ? (
              <Button variant="primary" size="lg" className={`w-full bg-gradient-to-r ${meta.color} border-0 rounded-xl h-12 font-bold`}
                onClick={() => partyStart(roomId)} disabled={players.length < 2}>
                <Play className="w-5 h-5 mr-2" /> Start Game {players.length < 2 ? '(need 2+)' : ''}
              </Button>
            ) : (
              <div className="flex items-center gap-2 text-text-muted">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-sm">Waiting for host to start...</span>
              </div>
            )}
          </div>
        )}

        {/* ── ROUND ── */}
        {phase === 'round' && (
          <div className="w-full max-w-lg flex flex-col gap-4">
            <RoundUI
              gameType={gameType}
              roundData={roundData}
              username={username}
              submitted={submitted}
              timeLeft={timeLeft}
              onSubmit={handleSubmitAction}
            />
          </div>
        )}

        {/* ── ROUND RESULT ── */}
        {phase === 'result' && (
          <div className="w-full max-w-lg flex flex-col gap-4">
            <div className="bg-bg-secondary border border-border-color rounded-2xl p-5">
              <h3 className="font-bold text-base text-text-primary mb-3">Round {currentRound} Results</h3>
              {roundResults && Object.entries(roundResults).map(([player, data]: [string, any]) => (
                <div key={player} className={`flex items-center gap-3 px-3 py-2.5 rounded-xl mb-1.5 ${player === username ? 'bg-accent-purple/10 border border-accent-purple/20' : 'bg-bg-tertiary'}`}>
                  <span className="font-semibold text-sm flex-1">{player === username ? 'You' : player}</span>
                  <span className="text-xs text-text-muted">{typeof data === 'object' ? (data.hint || data.correct?.toString() || JSON.stringify(data)) : data}</span>
                  {typeof data === 'object' && data.points != null && (
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${data.points > 0 ? 'bg-green-500/10 text-green-400' : 'bg-bg-tertiary text-text-muted'}`}>
                      +{data.points}
                    </span>
                  )}
                </div>
              ))}
            </div>
            {/* Scoreboard */}
            <Scoreboard players={scoreboard} username={username} />
          </div>
        )}

        {/* ── GAME OVER ── */}
        {phase === 'gameover' && (
          <div className="w-full max-w-md flex flex-col items-center gap-5">
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-yellow-400 to-amber-600 flex items-center justify-center shadow-2xl animate-bounce">
              <Trophy className="w-10 h-10 text-white" />
            </div>
            <h2 className="text-2xl font-extrabold text-text-primary">
              {winner === username ? '🎉 You Won!' : `${winner} Wins!`}
            </h2>
            <Scoreboard players={finalScoreboard} username={username} />
            <div className="flex flex-col sm:flex-row gap-2 w-full mt-2">
              <Button variant="outline" className="flex-1 rounded-xl h-11" onClick={() => { partyLeave(roomId); onBack(); }}>Leave</Button>
              <Button variant="primary" className={`flex-1 rounded-xl h-11 border-0 font-bold flex items-center justify-center gap-2 ${rematchRequested ? 'bg-gray-600' : 'bg-gradient-to-r from-green-500 to-emerald-600'}`}
                onClick={() => { setRematchRequested(true); partyRematch(roomId); }} disabled={rematchRequested}>
                <RotateCcw className="w-4 h-4" /> {rematchRequested ? `Waiting (${rematchPlayers.length})...` : 'Rematch'}
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* ── Chat Panel ── */}
      {chatOpen && phase !== 'lobby' && (
        <div className="absolute right-0 top-14 sm:top-16 bottom-0 w-full sm:w-72 bg-bg-secondary border-l border-border-color flex flex-col z-30 shadow-2xl">
          <div className="flex items-center justify-between px-3 py-2.5 border-b border-border-color">
            <h3 className="font-bold text-xs text-text-primary">Game Chat</h3>
            <button onClick={() => setChatOpen(false)} className="p-1 hover:bg-bg-tertiary rounded-lg text-text-muted"><X className="w-4 h-4" /></button>
          </div>
          <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-1.5">
            {chatMessages.map((m, i) => (
              <div key={i} className={`flex ${m.sender === username ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] px-3 py-1.5 rounded-xl text-xs ${m.sender === username ? 'bg-accent-purple text-white rounded-tr-sm' : 'bg-bg-tertiary border border-border-color text-text-primary rounded-tl-sm'}`}>
                  {m.sender !== username && <p className="text-[9px] font-bold text-accent-orange">{m.sender}</p>}
                  <p>{m.message}</p>
                </div>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>
          <form onSubmit={handleSendChat} className="p-2 border-t border-border-color flex gap-1.5">
            <input type="text" placeholder="Type..." value={chatInput} onChange={e => setChatInput(e.target.value)}
              className="flex-1 h-8 bg-bg-tertiary border border-border-color rounded-lg px-2.5 text-xs text-text-primary focus:outline-none min-w-0" />
            <Button type="submit" variant="primary" className="h-8 px-2.5 rounded-lg bg-accent-purple border-0 shrink-0" disabled={!chatInput.trim()}>
              <Send className="w-3 h-3" />
            </Button>
          </form>
        </div>
      )}
    </div>
  );
};

// ─── Scoreboard Component ───
const Scoreboard = ({ players, username }: { players: Player[]; username: string }) => (
  <div className="w-full bg-bg-secondary border border-border-color rounded-2xl overflow-hidden">
    <div className="px-4 py-2.5 border-b border-border-color">
      <h3 className="text-xs font-bold text-text-muted uppercase flex items-center gap-2"><Trophy className="w-3.5 h-3.5 text-yellow-500" /> Scoreboard</h3>
    </div>
    {[...players].sort((a, b) => b.score - a.score).map((p, i) => (
      <div key={p.username} className={`flex items-center gap-3 px-4 py-3 border-b border-border-color/30 last:border-0 ${p.username === username ? 'bg-accent-purple/5' : ''}`}>
        <span className="text-base w-7 text-center">{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}</span>
        <span className="font-semibold text-sm text-text-primary flex-1 truncate">{p.username === username ? 'You' : p.username}</span>
        <span className="text-sm font-bold text-accent-purple">{p.score} pts</span>
      </div>
    ))}
  </div>
);

// ─── Round UI — renders different inputs per game type ───
const RoundUI = ({ gameType, roundData, username, submitted, timeLeft, onSubmit }: {
  gameType: string; roundData: any; username: string; submitted: boolean; timeLeft: number; onSubmit: (data: any) => void;
}) => {
  const [input, setInput] = useState('');
  const [selectedOption, setSelectedOption] = useState('');
  const [predictions, setPredictions] = useState<Record<string, string>>({});
  const [recalled, setRecalled] = useState<string[]>([]);
  const [showItems, setShowItems] = useState(true);

  // Reset state on new round
  useEffect(() => {
    setInput(''); setSelectedOption(''); setPredictions({}); setRecalled([]); setShowItems(true);
  }, [roundData]);

  // Memory game: hide items after timer
  useEffect(() => {
    if (gameType === 'MEMORY_GAME' && roundData?.showTimeMs) {
      setShowItems(true);
      const t = setTimeout(() => setShowItems(false), roundData.showTimeMs);
      return () => clearTimeout(t);
    }
  }, [gameType, roundData]);

  if (submitted) {
    return (
      <div className="bg-bg-secondary border border-border-color rounded-2xl p-8 flex flex-col items-center gap-3">
        <CheckCircle className="w-10 h-10 text-green-500" />
        <p className="font-bold text-text-primary">Answer Submitted!</p>
        <p className="text-sm text-text-muted">Waiting for other players...</p>
        <Loader2 className="w-5 h-5 animate-spin text-accent-purple mt-2" />
      </div>
    );
  }

  if (timeLeft === 0) {
    return (
      <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-8 flex flex-col items-center gap-3">
        <Timer className="w-10 h-10 text-red-500" />
        <p className="font-bold text-red-400">Time's Up!</p>
      </div>
    );
  }

  const instruction = roundData?.instruction || roundData?.question || '';
  const phase = roundData?.phase || 1;

  // Render based on game type
  switch (gameType) {
    case 'GUESS_THE_NUMBER':
      return (
        <div className="bg-bg-secondary border border-border-color rounded-2xl p-5 flex flex-col gap-4">
          <p className="font-bold text-base text-text-primary text-center">{instruction || `Guess a number (${roundData?.min || 1}–${roundData?.max || 100})`}</p>
          <input type="number" min={roundData?.min || 1} max={roundData?.max || 100} value={input} onChange={e => setInput(e.target.value)}
            className="h-14 bg-bg-tertiary border border-border-color rounded-xl px-5 text-center text-2xl font-bold text-text-primary focus:outline-none focus:border-accent-purple" placeholder="?" />
          <Button variant="primary" className="rounded-xl h-12 bg-gradient-to-r from-purple-500 to-pink-500 border-0 font-bold" onClick={() => onSubmit({ answer: parseInt(input), guess: parseInt(input) })} disabled={!input}>
            Submit Guess
          </Button>
        </div>
      );

    case 'THIS_OR_THAT':
      return (
        <div className="bg-bg-secondary border border-border-color rounded-2xl p-5 flex flex-col gap-4">
          <p className="font-bold text-base text-text-primary text-center">{roundData?.question || instruction}</p>
          {phase === 1 && roundData?.options ? (
            <div className="grid grid-cols-2 gap-3">
              {roundData.options.map((opt: string) => (
                <button key={opt} onClick={() => { setSelectedOption(opt); onSubmit({ choice: opt }); }}
                  className={`p-5 rounded-xl border-2 text-base font-bold transition-all ${selectedOption === opt ? 'border-accent-orange bg-accent-orange/10 text-accent-orange' : 'border-border-color bg-bg-tertiary text-text-primary hover:border-accent-orange/50'}`}>
                  {opt}
                </button>
              ))}
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-text-secondary text-center">{roundData?.instruction || 'Predict the majority!'}</p>
              {roundData?.options?.map((opt: string) => (
                <button key={opt} onClick={() => onSubmit({ prediction: opt })}
                  className="p-4 rounded-xl border border-border-color bg-bg-tertiary text-text-primary font-semibold hover:border-accent-orange transition-colors">
                  {opt}
                </button>
              ))}
            </div>
          )}
        </div>
      );

    case 'QUICK_QUIZ':
      return (
        <div className="bg-bg-secondary border border-border-color rounded-2xl p-5 flex flex-col gap-4">
          <p className="font-bold text-base text-text-primary text-center">{roundData?.question}</p>
          <div className="grid grid-cols-2 gap-2">
            {roundData?.options?.map((opt: string) => (
              <button key={opt} onClick={() => onSubmit({ answer: opt })}
                className="p-4 rounded-xl border border-border-color bg-bg-tertiary text-text-primary font-semibold hover:border-green-500 hover:bg-green-500/5 transition-all text-sm">
                {opt}
              </button>
            ))}
          </div>
        </div>
      );

    case 'MEMORY_GAME':
      return (
        <div className="bg-bg-secondary border border-border-color rounded-2xl p-5 flex flex-col gap-4">
          <p className="font-bold text-base text-text-primary text-center">{showItems ? 'Memorize these items!' : 'Type what you remember!'}</p>
          {showItems ? (
            <div className="grid grid-cols-3 gap-2">
              {roundData?.items?.map((item: string, i: number) => (
                <div key={i} className="p-3 rounded-xl bg-accent-purple/10 border border-accent-purple/20 text-center font-bold text-sm text-accent-purple">{item}</div>
              ))}
            </div>
          ) : (
            <>
              <div className="flex flex-wrap gap-2">
                {recalled.map((item, i) => (
                  <span key={i} className="px-3 py-1.5 rounded-full bg-accent-purple/10 text-accent-purple text-xs font-semibold flex items-center gap-1">
                    {item} <button onClick={() => setRecalled(prev => prev.filter((_, j) => j !== i))}><X className="w-3 h-3" /></button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <input type="text" value={input} onChange={e => setInput(e.target.value)} placeholder="Type an item..."
                  onKeyDown={e => { if (e.key === 'Enter' && input.trim()) { setRecalled(prev => [...prev, input.trim()]); setInput(''); } }}
                  className="flex-1 h-10 bg-bg-tertiary border border-border-color rounded-xl px-4 text-sm text-text-primary focus:outline-none" />
                <Button variant="outline" className="rounded-xl h-10 px-4" onClick={() => { if (input.trim()) { setRecalled(prev => [...prev, input.trim()]); setInput(''); } }}>Add</Button>
              </div>
              <Button variant="primary" className="rounded-xl h-11 bg-gradient-to-r from-violet-500 to-purple-600 border-0 font-bold" onClick={() => onSubmit({ recalled })}>
                Submit ({recalled.length} items)
              </Button>
            </>
          )}
        </div>
      );

    case 'BLUFF':
      if (phase === 2 && roundData?.answers) {
        return (
          <div className="bg-bg-secondary border border-border-color rounded-2xl p-5 flex flex-col gap-4">
            <p className="font-bold text-base text-text-primary text-center">Who is the liar? 🕵️</p>
            <div className="flex flex-col gap-2">
              {Object.entries(roundData.answers).map(([player, answer]: [string, any]) => (
                <button key={player} onClick={() => onSubmit({ vote: player })}
                  className="flex items-center justify-between p-4 rounded-xl border border-border-color bg-bg-tertiary hover:border-red-500/50 transition-colors">
                  <span className="font-semibold text-sm">{player}</span>
                  <span className="text-sm text-text-secondary">"{answer}"</span>
                </button>
              ))}
            </div>
          </div>
        );
      }
      // Phase 1 - answer
      return (
        <div className="bg-bg-secondary border border-border-color rounded-2xl p-5 flex flex-col gap-4">
          <p className="font-bold text-base text-text-primary text-center">{roundData?.question}</p>
          {roundData?.isLiar && <p className="text-center text-red-400 text-sm font-bold bg-red-500/10 rounded-xl py-2">🤫 You are the LIAR! Suggested: {roundData?.suggestedAnswer}</p>}
          <input type="text" value={input} onChange={e => setInput(e.target.value)} placeholder="Your answer..."
            className="h-12 bg-bg-tertiary border border-border-color rounded-xl px-4 text-sm text-text-primary focus:outline-none focus:border-accent-purple" />
          <Button variant="primary" className="rounded-xl h-11 bg-gradient-to-r from-red-500 to-rose-600 border-0 font-bold" onClick={() => onSubmit({ answer: input })} disabled={!input.trim()}>
            Submit Answer
          </Button>
        </div>
      );

    case 'SECRET_HINT':
      if (roundData?.role === 'HINT_GIVER') {
        return (
          <div className="bg-bg-secondary border border-border-color rounded-2xl p-5 flex flex-col gap-4">
            <p className="font-bold text-base text-text-primary text-center">You're the Hint Giver! 💡</p>
            <p className="text-sm text-text-secondary text-center">Suggested word: <strong>{roundData.suggestedWord}</strong></p>
            <input type="text" value={input} onChange={e => setInput(e.target.value)} placeholder="Your word..."
              className="h-11 bg-bg-tertiary border border-border-color rounded-xl px-4 text-sm text-text-primary focus:outline-none" />
            <input type="text" value={selectedOption} onChange={e => setSelectedOption(e.target.value)} placeholder="Your hint..."
              className="h-11 bg-bg-tertiary border border-border-color rounded-xl px-4 text-sm text-text-primary focus:outline-none" />
            <Button variant="primary" className="rounded-xl h-11 bg-gradient-to-r from-teal-500 to-cyan-600 border-0 font-bold"
              onClick={() => onSubmit({ word: input || roundData.suggestedWord, hint: selectedOption })} disabled={!selectedOption.trim()}>
              Send Hint
            </Button>
          </div>
        );
      }
      if (roundData?.hint) {
        return (
          <div className="bg-bg-secondary border border-border-color rounded-2xl p-5 flex flex-col gap-4">
            <p className="font-bold text-base text-text-primary text-center">Guess the word!</p>
            <div className="bg-accent-purple/10 border border-accent-purple/20 rounded-xl p-4 text-center">
              <p className="text-xs text-text-muted">Hint from {roundData.hintGiver}:</p>
              <p className="text-lg font-bold text-accent-purple mt-1">"{roundData.hint}"</p>
            </div>
            <input type="text" value={input} onChange={e => setInput(e.target.value)} placeholder="Your guess..."
              className="h-12 bg-bg-tertiary border border-border-color rounded-xl px-4 text-sm text-text-primary focus:outline-none focus:border-accent-purple" />
            <Button variant="primary" className="rounded-xl h-11 bg-gradient-to-r from-teal-500 to-cyan-600 border-0 font-bold" onClick={() => onSubmit({ answer: input, guess: input })} disabled={!input.trim()}>
              Submit Guess
            </Button>
          </div>
        );
      }
      return <div className="bg-bg-secondary border border-border-color rounded-2xl p-8 text-center text-text-muted"><Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />Waiting for hint giver...</div>;

    // GUESS_FAVORITES, PREDICT_ME — generic answer/prediction
    default:
      if (phase === 2 && roundData?.players) {
        // Prediction phase
        return (
          <div className="bg-bg-secondary border border-border-color rounded-2xl p-5 flex flex-col gap-4">
            <p className="font-bold text-base text-text-primary text-center">{instruction || 'Predict their answers!'}</p>
            {roundData.players.filter((p: string) => p !== username).map((p: string) => (
              <div key={p} className="flex items-center gap-3">
                <span className="text-sm font-semibold text-text-primary w-24 truncate">{p}</span>
                <input type="text" value={predictions[p] || ''} onChange={e => setPredictions(prev => ({ ...prev, [p]: e.target.value }))} placeholder="Your prediction..."
                  className="flex-1 h-10 bg-bg-tertiary border border-border-color rounded-lg px-3 text-sm text-text-primary focus:outline-none" />
              </div>
            ))}
            <Button variant="primary" className="rounded-xl h-11 bg-gradient-to-r from-cyan-500 to-blue-500 border-0 font-bold"
              onClick={() => onSubmit({ predictions })}>
              Submit Predictions
            </Button>
          </div>
        );
      }
      return (
        <div className="bg-bg-secondary border border-border-color rounded-2xl p-5 flex flex-col gap-4">
          <p className="font-bold text-base text-text-primary text-center">{roundData?.question || instruction}</p>
          {roundData?.targetPlayer && <p className="text-sm text-text-secondary text-center">For: <strong>{roundData.targetPlayer}</strong></p>}
          <input type="text" value={input} onChange={e => setInput(e.target.value)} placeholder="Your answer..."
            className="h-12 bg-bg-tertiary border border-border-color rounded-xl px-4 text-base text-text-primary focus:outline-none focus:border-accent-purple" />
          <Button variant="primary" className={`rounded-xl h-11 bg-gradient-to-r ${GAME_META[gameType]?.color || 'from-accent-purple to-accent-hover'} border-0 font-bold`}
            onClick={() => onSubmit({ answer: input })} disabled={!input.trim()}>
            Submit
          </Button>
        </div>
      );
  }
};
