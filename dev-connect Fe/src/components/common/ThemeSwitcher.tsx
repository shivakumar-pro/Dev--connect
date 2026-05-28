import { Moon, Sun, Heart } from 'lucide-react';
import { useTheme, type Theme } from '../../context/ThemeContext';

const OPTIONS: { key: Theme; label: string; icon: typeof Moon }[] = [
  { key: 'dark', label: 'Dark', icon: Moon },
  { key: 'light', label: 'Light', icon: Sun },
  { key: 'devconnect', label: 'DevConnect', icon: Heart },
];

/** Full segmented control — use in settings / sidebars. */
export const ThemeSwitcher = ({ className = '' }: { className?: string }) => {
  const { theme, setTheme } = useTheme();
  return (
    <div className={`flex items-center gap-1 p-1 rounded-xl bg-bg-tertiary border border-border-color ${className}`}>
      {OPTIONS.map(({ key, label, icon: Icon }) => {
        const active = theme === key;
        return (
          <button
            key={key}
            onClick={() => setTheme(key)}
            title={label}
            className={`flex-1 flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              active
                ? 'bg-gradient-to-r from-accent-purple to-accent-orange text-white shadow'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{label}</span>
          </button>
        );
      })}
    </div>
  );
};

/** Compact single button that cycles through themes — use in navbars. */
export const ThemeToggleButton = ({ className = '' }: { className?: string }) => {
  const { theme, setTheme } = useTheme();
  const idx = OPTIONS.findIndex((o) => o.key === theme);
  const current = OPTIONS[idx === -1 ? 0 : idx];
  const next = OPTIONS[(idx + 1) % OPTIONS.length];
  const Icon = current.icon;
  return (
    <button
      onClick={() => setTheme(next.key)}
      title={`Theme: ${current.label} — switch to ${next.label}`}
      aria-label={`Switch theme (current: ${current.label})`}
      className={`w-9 h-9 rounded-lg flex items-center justify-center text-text-secondary hover:text-text-primary hover:bg-hover-bg border border-border-color transition-colors ${className}`}
    >
      <Icon className="w-4 h-4" />
    </button>
  );
};
