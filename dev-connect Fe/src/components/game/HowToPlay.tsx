import { useState } from 'react';
import { createPortal } from 'react-dom';
import { HelpCircle, X } from 'lucide-react';

export interface HowToPlayProps {
  title: string;
  steps: string[];
  tip?: string;
  /** Optional extra classes for the trigger button. */
  className?: string;
}

/**
 * A small "?" header button that opens a short rules popup.
 * Drop it into any game header: <HowToPlay title="..." steps={[...]} tip="..." />
 */
export const HowToPlay = ({ title, steps, tip, className = '' }: HowToPlayProps) => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="How to play"
        aria-label="How to play"
        className={`p-1.5 sm:p-2 hover:bg-bg-tertiary rounded-xl transition-colors text-text-secondary ${className}`}
      >
        <HelpCircle className="w-5 h-5" />
      </button>

      {open && createPortal(
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-sm bg-bg-secondary border border-border-color rounded-2xl p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-text-primary flex items-center gap-2">
                <HelpCircle className="w-4 h-4 text-accent-orange" /> {title}
              </h3>
              <button onClick={() => setOpen(false)} className="p-1 hover:bg-hover-bg rounded-lg text-text-muted">
                <X className="w-4 h-4" />
              </button>
            </div>
            <ol className="flex flex-col gap-2.5">
              {steps.map((s, i) => (
                <li key={i} className="flex gap-2.5 text-sm text-text-secondary">
                  <span className="shrink-0 w-5 h-5 rounded-full bg-accent-orange/15 text-accent-orange text-[11px] font-bold flex items-center justify-center mt-0.5">
                    {i + 1}
                  </span>
                  <span className="leading-relaxed">{s}</span>
                </li>
              ))}
            </ol>
            {tip && <p className="mt-4 pt-3 border-t border-border-color text-xs text-text-muted leading-relaxed">💡 {tip}</p>}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
};
