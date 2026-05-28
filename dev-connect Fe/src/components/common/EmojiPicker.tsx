import { useState } from 'react';
import { Smile } from 'lucide-react';

const GROUPS: { label: string; icon: string; emojis: string[] }[] = [
  {
    label: 'Smileys', icon: '😀',
    emojis: ['😀','😃','😄','😁','😆','😅','🤣','😂','🙂','🙃','😉','😊','😇','🥰','😍','🤩','😘','😗','😚','😙','😋','😛','😜','🤪','😝','🤗','🤭','🤔','🤐','😐','😑','😶','😏','😒','🙄','😬','😌','😔','😪','😴','😷','🤒','🤕','🥵','🥶','😵','🤯','🤠','🥳','😎','🤓','🧐','😕','😟','🙁','😮','😲','😳','🥺','😢','😭','😱','😖','😞','😩','😤','😡','🤬','👿','💀','🤡'],
  },
  {
    label: 'Gestures', icon: '👍',
    emojis: ['👍','👎','👊','✊','🤛','🤜','🤞','✌️','🤟','🤘','👌','🤌','🤏','👈','👉','👆','👇','☝️','✋','🤚','🖐️','🖖','👋','🤙','💪','🙏','👏','🙌','👐','🤲','🤝','✍️','💅','🤳','💃','🕺','🚶','🏃'],
  },
  {
    label: 'Hearts', icon: '❤️',
    emojis: ['❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❣️','💕','💞','💓','💗','💖','💘','💝','❤️‍🔥','✨','💫','⭐','🌟','💥','🔥','💯','🎉','🎊'],
  },
  {
    label: 'Animals', icon: '🐶',
    emojis: ['🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐨','🐯','🦁','🐮','🐷','🐸','🐵','🐔','🐧','🐦','🦆','🦅','🦉','🐺','🐗','🐴','🦄','🐝','🐛','🦋','🐌','🐞','🐢','🐍','🐙','🦀','🐠','🐬','🐳','🐳','🐝','🦖'],
  },
  {
    label: 'Food', icon: '🍕',
    emojis: ['🍏','🍎','🍐','🍊','🍋','🍌','🍉','🍇','🍓','🫐','🍒','🍑','🥭','🍍','🥥','🥝','🍅','🥑','🌽','🥕','🍔','🍟','🍕','🌭','🥪','🌮','🌯','🍿','🍩','🍪','🎂','🍰','🧁','🍫','🍬','🍭','🍦','☕','🍵','🧋','🍺','🍻','🥂','🍷'],
  },
  {
    label: 'Activities', icon: '⚽',
    emojis: ['⚽','🏀','🏈','⚾','🎾','🏐','🏉','🎱','🏓','🏸','⛳','🥊','🎽','⛸️','🎿','🏂','🏋️','🤸','🏇','🧘','🏄','🏊','🚴','🎮','🕹️','🎲','♟️','🎯','🎳','🎸','🎹','🎺','🎻','🥁','🎤','🎧','🎬','🎨'],
  },
  {
    label: 'Objects', icon: '💡',
    emojis: ['💡','🔦','🕯️','💻','🖥️','⌨️','🖱️','📱','☎️','📞','📺','📷','📸','📹','🎥','🔋','🔌','💾','💿','🧮','⏰','⌚','📡','🔭','🔬','💊','💉','🔑','🔒','🔓','🛠️','⚙️','🧲','📌','📎','✂️','📅','📈'],
  },
  {
    label: 'Symbols', icon: '✨',
    emojis: ['✨','🌟','💫','⚡','🔥','💥','❄️','🌈','☀️','🌙','⭐','✅','❌','⭕','❗','❓','💯','🔔','🎉','🎊','🎈','🎁','🏆','🥇','🥈','🥉','🎯','💎','👑','🚀','💬','💭','♻️','✔️','➕','➖','🆗','🆒'],
  },
];

interface Props {
  onSelect: (emoji: string) => void;
  className?: string;       // extra classes for the trigger button
  activeColor?: string;     // tailwind text/bg classes for active trigger
}

export const EmojiPicker = ({ onSelect, className = '', activeColor = 'text-accent-purple bg-accent-purple/15' }: Props) => {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState(0);

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Emoji"
        className={`w-11 h-11 sm:w-12 sm:h-12 rounded-full flex items-center justify-center transition-colors ${
          open ? activeColor : 'bg-bg-tertiary text-text-muted hover:text-accent-purple'
        } ${className}`}
      >
        <Smile className="w-5 h-5 sm:w-6 sm:h-6" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute bottom-full left-0 mb-2 z-40 w-[300px] sm:w-[340px] bg-bg-secondary border border-border-color rounded-2xl shadow-2xl overflow-hidden">
            {/* Category tabs */}
            <div className="flex items-center gap-0.5 px-2 py-1.5 border-b border-border-color overflow-x-auto">
              {GROUPS.map((g, i) => (
                <button
                  key={g.label}
                  type="button"
                  title={g.label}
                  onClick={() => setTab(i)}
                  className={`w-8 h-8 rounded-lg text-lg flex items-center justify-center shrink-0 transition-colors ${
                    tab === i ? 'bg-accent-purple/15' : 'hover:bg-bg-tertiary'
                  }`}
                >
                  {g.icon}
                </button>
              ))}
            </div>

            {/* Emoji grid */}
            <div className="p-2 h-[200px] overflow-y-auto">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-text-muted px-1 mb-1.5">{GROUPS[tab].label}</div>
              <div className="grid grid-cols-8 gap-0.5">
                {GROUPS[tab].emojis.map((e, idx) => (
                  <button
                    key={`${e}-${idx}`}
                    type="button"
                    onClick={() => onSelect(e)}
                    className="w-9 h-9 rounded-lg hover:bg-bg-tertiary transition-colors text-xl flex items-center justify-center"
                  >
                    {e}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
