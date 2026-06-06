import { useEffect, useRef } from 'react';

/**
 * setInterval that pauses when the page is hidden, fires immediately when the
 * tab comes back, and tracks the latest callback (so consumers don't need to
 * worry about stale closures or `enabled` race conditions).
 *
 * Saves a ton of CPU/network across the game polls (Bottle 1.5s, Dice 2s, Toxic
 * 1.8s, etc.) when the user has the tab in the background or the laptop closed.
 *
 *   useVisiblePolling(() => refresh(roomId), 1500, !!roomId && phase !== 'lobby');
 */
export const useVisiblePolling = (
  callback: () => void,
  intervalMs: number,
  enabled: boolean = true,
) => {
  const savedRef = useRef(callback);

  // Always invoke the latest callback without re-creating the interval.
  useEffect(() => {
    savedRef.current = callback;
  }, [callback]);

  useEffect(() => {
    if (!enabled || intervalMs <= 0) return;
    let timer: ReturnType<typeof setInterval> | null = null;

    const start = () => {
      if (timer) return;
      timer = setInterval(() => {
        if (document.visibilityState !== 'visible') return;
        savedRef.current();
      }, intervalMs);
    };
    const stop = () => {
      if (timer) { clearInterval(timer); timer = null; }
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        // Catch up with one immediate refresh when coming back, then resume ticks.
        savedRef.current();
        start();
      } else {
        stop();
      }
    };

    start();
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [intervalMs, enabled]);
};
