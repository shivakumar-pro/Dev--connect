import { useState, useEffect } from 'react';
import {
  Gamepad2, Trophy, Users, Crown, Target, Zap, Sparkles, Eye, Lightbulb,
  HelpCircle, Brain, Hash, Dices, ArrowRight,
} from 'lucide-react';
import { GuessTheNumber } from './GuessTheNumber';
import { PartyRoom } from './PartyRoom';
import { DiceGame } from './DiceGame';

// ── Game Card type ──
interface GameCard {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  players: string;
  gradient: string;
  bgGlow: string;
  type: 'party' | 'standalone' | 'coming-soon';
  partyKey?: string;
}

// ── Categories ──
interface Category {
  title: string;
  emoji: string;
  description: string;
  games: GameCard[];
}

const CATEGORIES: Category[] = [
  {
    title: 'Guessing & Strategy',
    emoji: '🎯',
    description: 'Test your intuition and outsmart your opponent',
    games: [
      {
        id: 'guess_1v1', name: 'Guess the Number',
        description: 'Classic 1v1 — pick, guess, win. Best of rounds!',
        icon: <Target className="w-5 h-5" />, players: '2',
        gradient: 'from-indigo-500 to-purple-500', bgGlow: 'shadow-indigo-500/20',
        type: 'standalone',
      },
      {
        id: 'bluff', name: 'Bluff',
        description: 'One player is lying — spot the imposter!',
        icon: <Eye className="w-5 h-5" />, players: '3-8',
        gradient: 'from-red-500 to-rose-600', bgGlow: 'shadow-red-500/20',
        type: 'party', partyKey: 'BLUFF',
      },
      {
        id: 'secret_hint', name: 'Secret Hint',
        description: 'Give a clue and let others guess the word!',
        icon: <Hash className="w-5 h-5" />, players: '2-8',
        gradient: 'from-teal-500 to-cyan-600', bgGlow: 'shadow-teal-500/20',
        type: 'party', partyKey: 'SECRET_HINT',
      },
    ],
  },
  {
    title: 'Mind & Memory',
    emoji: '🧠',
    description: 'Challenge your brain power',
    games: [
      {
        id: 'memory_game', name: 'Memory Game',
        description: 'Memorize items then recall as many as you can!',
        icon: <Brain className="w-5 h-5" />, players: '2-8',
        gradient: 'from-violet-500 to-purple-600', bgGlow: 'shadow-violet-500/20',
        type: 'party', partyKey: 'MEMORY_GAME',
      },
      {
        id: 'predict_me', name: 'Predict Me',
        description: 'Answer a question, then predict what others said!',
        icon: <HelpCircle className="w-5 h-5" />, players: '2-8',
        gradient: 'from-cyan-500 to-blue-500', bgGlow: 'shadow-cyan-500/20',
        type: 'party', partyKey: 'PREDICT_ME',
      },
      {
        id: 'guess_favorites', name: 'Guess Favorites',
        description: "How well do you know your friends' picks?",
        icon: <Sparkles className="w-5 h-5" />, players: '2-8',
        gradient: 'from-pink-500 to-rose-500', bgGlow: 'shadow-pink-500/20',
        type: 'party', partyKey: 'GUESS_FAVORITES',
      },
    ],
  },
  {
    title: 'Quiz & Speed',
    emoji: '⚡',
    description: 'Be the fastest to win',
    games: [
      {
        id: 'quick_quiz', name: 'Quick Quiz',
        description: 'Answer first to score the most — speed matters!',
        icon: <Lightbulb className="w-5 h-5" />, players: '2-8',
        gradient: 'from-green-500 to-emerald-500', bgGlow: 'shadow-green-500/20',
        type: 'party', partyKey: 'QUICK_QUIZ',
      },
      {
        id: 'this_or_that', name: 'This or That',
        description: 'Pick a side, predict the majority choice!',
        icon: <Zap className="w-5 h-5" />, players: '2-8',
        gradient: 'from-amber-500 to-orange-500', bgGlow: 'shadow-amber-500/20',
        type: 'party', partyKey: 'THIS_OR_THAT',
      },
    ],
  },
  {
    title: 'Dice & Luck',
    emoji: '🎲',
    description: 'Roll the dice and test your luck',
    games: [
      {
        id: 'dice_pig', name: 'Pig',
        description: 'Roll or hold — but roll a 1 and lose it all!',
        icon: <Dices className="w-5 h-5" />, players: '2-4',
        gradient: 'from-yellow-500 to-amber-600', bgGlow: 'shadow-yellow-500/20',
        type: 'standalone',
      },
      {
        id: 'dice_farkle', name: 'Farkle',
        description: 'Keep scoring dice, push your luck, or bank it!',
        icon: <Dices className="w-5 h-5" />, players: '2-4',
        gradient: 'from-orange-500 to-red-500', bgGlow: 'shadow-orange-500/20',
        type: 'standalone',
      },
      {
        id: 'dice_liars', name: "Liar's Dice",
        description: 'Bluff your bids — call the liar! Last one standing wins.',
        icon: <Eye className="w-5 h-5" />, players: '2-4',
        gradient: 'from-red-500 to-rose-600', bgGlow: 'shadow-red-500/20',
        type: 'standalone',
      },
      {
        id: 'dice_scc', name: 'Ship Captain Crew',
        description: 'Lock 6-5-4 in order, then score your cargo!',
        icon: <Dices className="w-5 h-5" />, players: '2-6',
        gradient: 'from-blue-500 to-indigo-600', bgGlow: 'shadow-blue-500/20',
        type: 'standalone',
      },
    ],
  },
];

type DiceTypeKey = 'PIG' | 'FARKLE' | 'LIARS_DICE' | 'SHIP_CAPTAIN_CREW';

const DICE_MAP: Record<string, DiceTypeKey> = {
  dice_pig: 'PIG',
  dice_farkle: 'FARKLE',
  dice_liars: 'LIARS_DICE',
  dice_scc: 'SHIP_CAPTAIN_CREW',
};
const REVERSE_DICE: Record<DiceTypeKey, string> = {
  PIG: 'dice_pig',
  FARKLE: 'dice_farkle',
  LIARS_DICE: 'dice_liars',
  SHIP_CAPTAIN_CREW: 'dice_scc',
};

export interface GameJoinInvite {
  kind: 'guess' | 'dice' | 'party';
  roomId: string;
  diceType?: DiceTypeKey;
  partyKey?: string;
}

export const GameRoom = ({ currentUser, joinInvite, onInviteConsumed }: { currentUser: any; joinInvite?: GameJoinInvite | null; onInviteConsumed?: () => void }) => {
  const [activeGame, setActiveGame] = useState<string | null>(null);
  const [activePartyKey, setActivePartyKey] = useState<string | undefined>(undefined);
  const [inviteRoomId, setInviteRoomId] = useState<string | undefined>(undefined);

  // Route an incoming chat invite into the correct game and auto-join its room.
  useEffect(() => {
    if (!joinInvite?.roomId) return;
    setInviteRoomId(joinInvite.roomId);
    if (joinInvite.kind === 'guess') {
      setActiveGame('guess_1v1');
    } else if (joinInvite.kind === 'party') {
      setActivePartyKey(joinInvite.partyKey);
      setActiveGame('party');
    } else if (joinInvite.kind === 'dice' && joinInvite.diceType) {
      setActiveGame(REVERSE_DICE[joinInvite.diceType]);
    }
    onInviteConsumed?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [joinInvite?.roomId]);

  const exitGame = () => { setActiveGame(null); setInviteRoomId(undefined); };

  if (activeGame === 'guess_1v1') {
    return <GuessTheNumber currentUser={currentUser} onBack={exitGame} initialRoomId={inviteRoomId} />;
  }
  if (activeGame === 'party') {
    return <PartyRoom currentUser={currentUser} onBack={exitGame} initialGameType={activePartyKey} initialRoomId={inviteRoomId} />;
  }
  if (activeGame && DICE_MAP[activeGame]) {
    return <DiceGame currentUser={currentUser} onBack={exitGame} gameType={DICE_MAP[activeGame]} initialRoomId={inviteRoomId} />;
  }

  const handlePlay = (game: GameCard) => {
    if (game.type === 'coming-soon') return;
    if (game.type === 'standalone') {
      setActiveGame(game.id);
    } else {
      setActivePartyKey(game.partyKey);
      setActiveGame('party');
    }
  };

  const totalGames = CATEGORIES.reduce((sum, c) => sum + c.games.length, 0);

  return (
    <div className="flex flex-col h-full w-full bg-bg-primary">
      {/* Header */}
      <header className="h-14 sm:h-16 px-4 sm:px-6 lg:px-8 border-b border-border-color flex items-center justify-between shrink-0 bg-bg-secondary/80 backdrop-blur-sm z-10">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-br from-accent-orange to-red-500 flex items-center justify-center shadow-lg shadow-accent-orange/20 shrink-0">
            <Gamepad2 className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
          </div>
          <div className="min-w-0">
            <h2 className="font-bold text-sm sm:text-base lg:text-lg text-text-primary leading-tight truncate">Game Room</h2>
            <p className="text-[10px] sm:text-xs text-text-secondary truncate">Play & connect with devs</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div className="flex items-center gap-1.5 bg-hover-bg border border-border-color rounded-full px-2.5 sm:px-3 py-1 sm:py-1.5">
            <Crown className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-yellow-500" />
            <span className="text-[11px] sm:text-xs font-semibold text-text-secondary">0 <span className="hidden sm:inline">Wins</span></span>
          </div>
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 lg:py-10 pb-24 lg:pb-12">

          {/* Hero */}
          <div className="mb-8 sm:mb-10">
            <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-1">
              <div>
                <div className="inline-block text-[10px] sm:text-[11px] font-mono uppercase tracking-wider text-accent-orange bg-accent-orange/10 px-2 py-0.5 rounded mb-2">
                  / game room
                </div>
                <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-text-primary tracking-tight">
                  Choose your <span className="bg-clip-text text-transparent bg-gradient-to-r from-accent-orange to-red-500">game</span>
                </h1>
              </div>
              <div className="flex items-center gap-3 text-[11px] sm:text-xs text-text-muted">
                <span className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  {totalGames} games available
                </span>
              </div>
            </div>
            <p className="text-sm text-text-secondary max-w-lg">
              Pick a game, create a room, invite friends — let's go.
            </p>
          </div>

          {/* Categories */}
          <div className="flex flex-col gap-10 sm:gap-12">
            {CATEGORIES.map((cat) => (
              <section key={cat.title}>
                {/* Category Header */}
                <div className="flex items-center justify-between gap-3 mb-4 sm:mb-5 pb-3 border-b border-border-color">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-hover-bg border border-border-color flex items-center justify-center text-lg sm:text-xl shrink-0">
                      {cat.emoji}
                    </div>
                    <div className="min-w-0">
                      <h2 className="font-bold text-sm sm:text-base lg:text-lg text-text-primary leading-tight truncate">{cat.title}</h2>
                      <p className="text-[11px] sm:text-xs text-text-muted truncate">{cat.description}</p>
                    </div>
                  </div>
                  <span className="hidden sm:inline-flex items-center text-[10px] font-mono text-text-muted bg-hover-bg border border-border-color rounded-md px-2 py-1 shrink-0">
                    {cat.games.length} {cat.games.length === 1 ? 'game' : 'games'}
                  </span>
                </div>

                {/* Game Cards Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                  {cat.games.map((game) => {
                    const isDisabled = game.type === 'coming-soon';
                    return (
                      <button
                        key={game.id}
                        onClick={() => handlePlay(game)}
                        disabled={isDisabled}
                        className={`group relative flex flex-col rounded-xl overflow-hidden text-left transition-all duration-300 ${
                          isDisabled
                            ? 'bg-bg-secondary/40 border border-border-color opacity-40 cursor-not-allowed'
                            : `bg-bg-secondary border border-border-color hover:border-border-hover hover:-translate-y-0.5 hover:shadow-xl ${game.bgGlow}`
                        }`}
                      >
                        {/* Background glow on hover */}
                        {!isDisabled && (
                          <div className={`absolute inset-0 bg-gradient-to-br ${game.gradient} opacity-0 group-hover:opacity-[0.06] transition-opacity pointer-events-none`} />
                        )}

                        <div className="relative p-4 sm:p-5 flex flex-col gap-3 flex-1">
                          {/* Top row: icon + players */}
                          <div className="flex items-start justify-between gap-3">
                            <div className={`w-11 h-11 sm:w-12 sm:h-12 rounded-xl bg-gradient-to-br ${game.gradient} flex items-center justify-center text-white shadow-lg transition-transform duration-300 ${!isDisabled ? 'group-hover:scale-110 group-hover:rotate-3' : ''}`}>
                              {game.icon}
                            </div>
                            <span className="text-[10px] sm:text-[11px] text-text-muted flex items-center gap-1 mt-1.5 shrink-0">
                              <Users className="w-3 h-3" /> {game.players}
                            </span>
                          </div>

                          {/* Text */}
                          <div className="flex-1 min-h-0">
                            <h3 className="font-semibold text-[14px] sm:text-[15px] text-text-primary mb-1 leading-snug">{game.name}</h3>
                            <p className="text-[12px] sm:text-[13px] text-text-secondary leading-relaxed line-clamp-2">{game.description}</p>
                          </div>

                          {/* Footer */}
                          <div className="flex items-center justify-between pt-3 border-t border-border-color">
                            {isDisabled ? (
                              <span className="text-[10px] sm:text-[11px] font-mono text-text-muted">Coming soon</span>
                            ) : (
                              <>
                                <span className="text-[10px] sm:text-[11px] font-mono text-text-muted">Ready to play</span>
                                <span className={`text-[11px] sm:text-xs font-semibold flex items-center gap-1 bg-gradient-to-r ${game.gradient} bg-clip-text text-transparent`}>
                                  Play <ArrowRight className="w-3 h-3 text-text-muted" />
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>

          {/* Leaderboard */}
          <div className="mt-12 sm:mt-16">
            <div className="flex items-center justify-between gap-3 mb-4 pb-3 border-b border-border-color">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-br from-yellow-500/20 to-amber-500/20 border border-yellow-500/20 flex items-center justify-center shrink-0">
                  <Trophy className="w-4 h-4 sm:w-5 sm:h-5 text-yellow-500" />
                </div>
                <div>
                  <h2 className="font-bold text-sm sm:text-base lg:text-lg text-text-primary leading-tight">Leaderboard</h2>
                  <p className="text-[11px] sm:text-xs text-text-muted">Top players this week</p>
                </div>
              </div>
            </div>
            <div className="bg-bg-secondary border border-border-color rounded-xl overflow-hidden">
              {[
                { rank: '🥇', text: 'Play a game to rank up!' },
                { rank: '🥈', text: 'Challenge your friends' },
                { rank: '🥉', text: 'Climb the leaderboard' },
              ].map((e, i) => (
                <div key={i} className="flex items-center gap-3 sm:gap-4 px-4 sm:px-5 py-3 sm:py-3.5 border-b border-border-color last:border-0">
                  <span className="text-base sm:text-lg w-7 text-center shrink-0">{e.rank}</span>
                  <span className="text-[12px] sm:text-xs text-text-muted flex-1 truncate">{e.text}</span>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};
