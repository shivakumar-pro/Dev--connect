import { useState } from 'react';
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
      // {
      //   id: 'guess_number', name: 'Guess the Number',
      //   description: 'Pick a secret number and race to guess your opponent\'s!',
      //   icon: <Target className="w-6 h-6" />, players: '2-8',
      //   gradient: 'from-purple-500 to-pink-500', bgGlow: 'shadow-purple-500/20',
      //   type: 'party', partyKey: 'GUESS_THE_NUMBER',
      // },
      {
        id: 'guess_1v1', name: 'Guess the Number',
        description: 'Classic 1v1 — pick, guess, win. Best of rounds!',
        icon: <Target className="w-6 h-6" />, players: '2',
        gradient: 'from-indigo-500 to-purple-500', bgGlow: 'shadow-indigo-500/20',
        type: 'standalone',
      },
      {
        id: 'bluff', name: 'Bluff',
        description: 'One player is lying — spot the imposter!',
        icon: <Eye className="w-6 h-6" />, players: '3-8',
        gradient: 'from-red-500 to-rose-600', bgGlow: 'shadow-red-500/20',
        type: 'party', partyKey: 'BLUFF',
      },
      {
        id: 'secret_hint', name: 'Secret Hint',
        description: 'Give a clue and let others guess the word!',
        icon: <Hash className="w-6 h-6" />, players: '2-8',
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
        icon: <Brain className="w-6 h-6" />, players: '2-8',
        gradient: 'from-violet-500 to-purple-600', bgGlow: 'shadow-violet-500/20',
        type: 'party', partyKey: 'MEMORY_GAME',
      },
      {
        id: 'predict_me', name: 'Predict Me',
        description: 'Answer a question, then predict what others said!',
        icon: <HelpCircle className="w-6 h-6" />, players: '2-8',
        gradient: 'from-cyan-500 to-blue-500', bgGlow: 'shadow-cyan-500/20',
        type: 'party', partyKey: 'PREDICT_ME',
      },
      {
        id: 'guess_favorites', name: 'Guess Favorites',
        description: 'How well do you know your friends\' picks?',
        icon: <Sparkles className="w-6 h-6" />, players: '2-8',
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
        icon: <Lightbulb className="w-6 h-6" />, players: '2-8',
        gradient: 'from-green-500 to-emerald-500', bgGlow: 'shadow-green-500/20',
        type: 'party', partyKey: 'QUICK_QUIZ',
      },
      {
        id: 'this_or_that', name: 'This or That',
        description: 'Pick a side, predict the majority choice!',
        icon: <Zap className="w-6 h-6" />, players: '2-8',
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
        icon: <Dices className="w-6 h-6" />, players: '2-4',
        gradient: 'from-yellow-500 to-amber-600', bgGlow: 'shadow-yellow-500/20',
        type: 'standalone',
      },
      {
        id: 'dice_farkle', name: 'Farkle',
        description: 'Keep scoring dice, push your luck, or bank it!',
        icon: <Dices className="w-6 h-6" />, players: '2-4',
        gradient: 'from-orange-500 to-red-500', bgGlow: 'shadow-orange-500/20',
        type: 'standalone',
      },
      {
        id: 'dice_liars', name: "Liar's Dice",
        description: 'Bluff your bids — call the liar! Last one standing wins.',
        icon: <Eye className="w-6 h-6" />, players: '2-4',
        gradient: 'from-red-500 to-rose-600', bgGlow: 'shadow-red-500/20',
        type: 'standalone',
      },
      {
        id: 'dice_scc', name: 'Ship Captain Crew',
        description: 'Lock 6-5-4 in order, then score your cargo!',
        icon: <Dices className="w-6 h-6" />, players: '2-6',
        gradient: 'from-blue-500 to-indigo-600', bgGlow: 'shadow-blue-500/20',
        type: 'standalone',
      },
    ],
  },
];

export const GameRoom = ({ currentUser }: { currentUser: any }) => {
  const [activeGame, setActiveGame] = useState<string | null>(null);
  const [activePartyKey, setActivePartyKey] = useState<string | undefined>(undefined);

  const DICE_MAP: Record<string, 'PIG' | 'FARKLE' | 'LIARS_DICE' | 'SHIP_CAPTAIN_CREW'> = {
    dice_pig: 'PIG',
    dice_farkle: 'FARKLE',
    dice_liars: 'LIARS_DICE',
    dice_scc: 'SHIP_CAPTAIN_CREW',
  };

  // Active game views — goes directly to the game, no game selector inside
  if (activeGame === 'guess_1v1') {
    return <GuessTheNumber currentUser={currentUser} onBack={() => setActiveGame(null)} />;
  }
  if (activeGame === 'party') {
    return <PartyRoom currentUser={currentUser} onBack={() => setActiveGame(null)} initialGameType={activePartyKey} />;
  }
  if (activeGame && DICE_MAP[activeGame]) {
    return <DiceGame currentUser={currentUser} onBack={() => setActiveGame(null)} gameType={DICE_MAP[activeGame]} />;
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

  return (
    <div className="flex flex-col h-full w-full bg-[#0B1120]">
      {/* Header */}
      <header className="h-14 sm:h-16 px-4 sm:px-8 border-b border-white/[0.06] flex items-center justify-between shrink-0 bg-[#0F172A]/80 backdrop-blur-sm z-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-accent-orange to-red-500 flex items-center justify-center shadow-lg shadow-accent-orange/20">
            <Gamepad2 className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="font-bold text-base sm:text-lg text-white leading-tight">Game Room</h2>
            <p className="text-[11px] sm:text-xs text-slate-400">Play & connect with devs</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 bg-white/[0.04] border border-white/[0.08] rounded-full px-3 py-1.5">
            <Crown className="w-3.5 h-3.5 text-yellow-500" />
            <span className="text-xs font-semibold text-slate-300">0 Wins</span>
          </div>
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto px-4 sm:px-8 py-6 sm:py-10 pb-24 lg:pb-10">

          {/* Hero */}
          <div className="text-center mb-8 sm:mb-12">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white mb-2">
              Choose your <span className="bg-clip-text text-transparent bg-gradient-to-r from-accent-orange to-red-500">Game</span>
            </h1>
            <p className="text-sm text-slate-400 max-w-md mx-auto">
              Pick a game, create a room, invite friends — let's go!
            </p>
          </div>

          {/* Categories */}
          <div className="flex flex-col gap-8 sm:gap-12">
            {CATEGORIES.map((cat) => {
              const hasEnabled = cat.games.some(g => g.type !== 'coming-soon');
              return (
                <section key={cat.title}>
                  {/* Category Header */}
                  <div className="flex items-center gap-3 mb-4 sm:mb-5">
                    <span className="text-xl sm:text-2xl">{cat.emoji}</span>
                    <div>
                      <h2 className="font-bold text-base sm:text-lg text-white leading-tight">{cat.title}</h2>
                      <p className="text-[11px] sm:text-xs text-slate-500">{cat.description}</p>
                    </div>
                  </div>

                  {/* Game Cards Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
                    {cat.games.map((game) => {
                      const isDisabled = game.type === 'coming-soon';
                      return (
                        <button
                          key={game.id}
                          onClick={() => handlePlay(game)}
                          disabled={isDisabled}
                          className={`group relative flex flex-col rounded-2xl overflow-hidden text-left transition-all duration-300 ${
                            isDisabled
                              ? 'bg-[#131C2E]/40 border border-white/[0.03] opacity-40 cursor-not-allowed'
                              : `bg-[#131C2E] border border-white/[0.06] hover:border-white/[0.15] hover:scale-[1.03] hover:shadow-xl ${game.bgGlow}`
                          }`}
                        >
                          {/* Top accent */}
                          <div className={`h-1 bg-gradient-to-r ${game.gradient} ${isDisabled ? 'opacity-40' : 'group-hover:h-1.5'} transition-all`} />

                          <div className="p-3.5 sm:p-4 flex flex-col gap-2.5 sm:gap-3 flex-1">
                            {/* Icon */}
                            <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-gradient-to-br ${game.gradient} flex items-center justify-center text-white shadow-lg transition-transform duration-300 ${!isDisabled ? 'group-hover:scale-110 group-hover:rotate-3' : ''}`}>
                              {game.icon}
                            </div>

                            {/* Text */}
                            <div className="flex-1 min-h-0">
                              <h3 className="font-bold text-[13px] sm:text-sm text-white mb-0.5 leading-snug">{game.name}</h3>
                              <p className="text-[10px] sm:text-[11px] text-slate-500 leading-relaxed line-clamp-2">{game.description}</p>
                            </div>

                            {/* Footer */}
                            <div className="flex items-center justify-between pt-2 border-t border-white/[0.04]">
                              <span className="text-[9px] sm:text-[10px] text-slate-600 flex items-center gap-1">
                                <Users className="w-3 h-3" /> {game.players}
                              </span>
                              {isDisabled ? (
                                <span className="text-[9px] sm:text-[10px] text-slate-600">Soon</span>
                              ) : (
                                <span className={`text-[9px] sm:text-[10px] font-semibold flex items-center gap-0.5 bg-gradient-to-r ${game.gradient} bg-clip-text text-transparent opacity-0 group-hover:opacity-100 transition-opacity`}>
                                  Play <ArrowRight className="w-2.5 h-2.5 text-white/40" />
                                </span>
                              )}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>

          {/* Leaderboard */}
          <div className="mt-10 sm:mt-14 bg-[#131C2E] border border-white/[0.06] rounded-2xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-white/[0.06] flex items-center gap-2">
              <Trophy className="w-4 h-4 text-yellow-500" />
              <h3 className="font-bold text-sm text-white">Leaderboard</h3>
            </div>
            {[
              { rank: '🥇', text: 'Play a game to rank up!' },
              { rank: '🥈', text: 'Challenge your friends' },
              { rank: '🥉', text: 'Climb the leaderboard' },
            ].map((e, i) => (
              <div key={i} className="flex items-center gap-3 px-5 py-3 border-b border-white/[0.03] last:border-0">
                <span className="text-lg w-7 text-center">{e.rank}</span>
                <span className="text-xs text-slate-500 flex-1">{e.text}</span>
              </div>
            ))}
          </div>

        </div>
      </div>
    </div>
  );
};
