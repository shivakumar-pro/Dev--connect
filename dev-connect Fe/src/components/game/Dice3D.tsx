import { memo } from 'react';
import { motion } from 'framer-motion';

/**
 * Dice3D — a true 3-D CSS cube die with cinematic, physics-inspired rolling.
 *
 * The die is server-authoritative: the parent already knows the final `value`
 * before the throw plays, so the animation is a deterministic one-shot that
 * lifts off the table, tumbles on both axes with motion blur, drops, bounces
 * twice with squash & stretch, wobbles, and settles exactly on `value`.
 *
 * Roll one full throw by bumping `rollId` (and setting `rolling`). When not
 * rolling the cube simply rests on the requested face.
 */

// Total airborne+settle time for a single die (ms). Parents should hold the
// "rolling" UI for DICE_ROLL_MS + (number of dice * DICE_STAGGER) + a buffer.
export const DICE_ROLL_MS = 2150;
export const DICE_STAGGER = 90;

type Props = {
  value: number;            // final face, 1–6
  rolling: boolean;         // play the throw vs. rest on the face
  rollId?: number;          // bump to replay the throw
  size?: number;            // px edge length
  delay?: number;           // ms stagger before this die launches
  className?: string;
};

// Base cube rotation that brings each face toward the camera (+Z).
// Opposite faces sum to 7: front 1 / back 6, right 3 / left 4, top 2 / bottom 5.
const FACE_ROT: Record<number, { x: number; y: number }> = {
  1: { x: 0, y: 0 },
  2: { x: -90, y: 0 },
  3: { x: 0, y: -90 },
  4: { x: 0, y: 90 },
  5: { x: 90, y: 0 },
  6: { x: 0, y: 180 },
};

// Which of the 3×3 grid cells carry a pip for each face value.
const PIPS: Record<number, number[]> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};

// Per-face static shading to fake a fixed light from the upper-left.
const FACE_SHADE: Record<string, string> = {
  front: 'brightness(1)',
  back: 'brightness(0.9)',
  top: 'brightness(1.12)',
  bottom: 'brightness(0.74)',
  right: 'brightness(0.86)',
  left: 'brightness(0.96)',
};

const FACE_PLACE = (h: number): Record<string, string> => ({
  front: `translateZ(${h}px)`,
  back: `rotateY(180deg) translateZ(${h}px)`,
  right: `rotateY(90deg) translateZ(${h}px)`,
  left: `rotateY(-90deg) translateZ(${h}px)`,
  top: `rotateX(90deg) translateZ(${h}px)`,
  bottom: `rotateX(-90deg) translateZ(${h}px)`,
});

const FACE_VALUE: Record<string, number> = {
  front: 1, back: 6, right: 3, left: 4, top: 2, bottom: 5,
};

const Pips = ({ value, size }: { value: number; size: number }) => {
  const on = PIPS[value] || [];
  const pip = size * 0.18;
  return (
    <div
      className="grid grid-cols-3 grid-rows-3"
      style={{ width: size * 0.78, height: size * 0.78, gap: size * 0.03 }}
    >
      {Array.from({ length: 9 }).map((_, i) => (
        <div key={i} className="flex items-center justify-center">
          {on.includes(i) && (
            <span
              style={{
                width: pip,
                height: pip,
                borderRadius: '50%',
                background: 'radial-gradient(circle at 34% 30%, #5a5a5a 0%, #161616 58%, #000 100%)',
                boxShadow:
                  'inset -1px -1px 2px rgba(0,0,0,0.7), inset 1px 1px 1.5px rgba(255,255,255,0.35), 0 0.5px 1px rgba(0,0,0,0.5)',
              }}
            />
          )}
        </div>
      ))}
    </div>
  );
};

export const Dice3D = memo(({ value, rolling, rollId = 0, size = 64, delay = 0, className = '' }: Props) => {
  const v = Math.min(6, Math.max(1, value || 1));
  const h = size / 2;
  const base = FACE_ROT[v];
  const places = FACE_PLACE(h);
  const radius = size * 0.16;

  // ── Cinematic throw timeline (normalised keyframe times) ──
  const times = [0, 0.06, 0.12, 0.3, 0.5, 0.62, 0.7, 0.8, 0.88, 0.94, 1];

  // Vertical lift + double bounce, with squash/stretch on the body.
  const y = [0, 2, -34, -94, -72, 0, -36, 0, -13, 0, 0];
  const scaleY = [0.82, 0.82, 1.14, 1, 1, 0.78, 1.1, 0.9, 1.03, 0.97, 1];
  const scaleX = [1.14, 1.14, 0.9, 1, 1, 1.16, 0.94, 1.07, 0.98, 1.02, 1];

  // Multi-axis tumble that decelerates into the exact resting face.
  const rx = [base.x - 1260, base.x - 1184, base.x - 1040, base.x - 760, base.x - 520, base.x - 300, base.x - 168, base.x - 80, base.x - 30, base.x - 8, base.x];
  const ry = [base.y - 1640, base.y - 1512, base.y - 1320, base.y - 980, base.y - 660, base.y - 380, base.y - 208, base.y - 96, base.y - 38, base.y - 10, base.y];
  const rz = [0, 0, 0, 0, 0, 0, -7, 5, -3, 1, 0];

  // Motion-blur ghost opacity — peaks at the fast apex, clears on settle.
  // (Applied to a separate flat overlay; a CSS filter on the cube itself would
  //  flatten its preserve-3d faces and kill the 3-D effect.)
  const ghost = [0, 0.28, 0.5, 0.5, 0.42, 0.18, 0.08, 0, 0, 0, 0];

  // Ground shadow: tight & dark when low, wide & faint when airborne.
  const shScale = [1, 1, 0.78, 0.5, 0.64, 1.18, 0.78, 1.12, 0.94, 1.05, 1];
  const shOpacity = [0.5, 0.5, 0.3, 0.16, 0.24, 0.55, 0.3, 0.48, 0.4, 0.46, 0.5];
  const shBlur = [3, 3, 6, 11, 7, 2, 6, 3, 4, 3, 3];

  const t = (d: number) => ({ duration: d / 1000, times, delay: delay / 1000, ease: 'easeInOut' as const });

  return (
    <div
      className={`relative inline-flex items-center justify-center ${className}`}
      style={{ width: size * 1.5, height: size * 1.6, perspective: size * 5 }}
    >
      {/* Ground shadow */}
      <motion.div
        key={`sh-${rollId}`}
        className="absolute rounded-full bg-black"
        style={{ width: size * 0.92, height: size * 0.34, bottom: size * 0.12, filter: 'blur(3px)' }}
        initial={false}
        animate={
          rolling
            ? { scale: shScale, opacity: shOpacity, filter: shBlur.map((b) => `blur(${b}px)`) }
            : { scale: 1, opacity: 0.5, filter: 'blur(3px)' }
        }
        transition={rolling ? t(DICE_ROLL_MS) : { duration: 0.3 }}
      />

      {/* Lift / bounce wrapper */}
      <motion.div
        key={`lift-${rollId}`}
        className="relative"
        style={{ width: size, height: size, transformStyle: 'preserve-3d' }}
        initial={false}
        animate={rolling ? { y, scaleX, scaleY } : { y: 0, scaleX: 1, scaleY: 1 }}
        transition={rolling ? t(DICE_ROLL_MS) : { type: 'spring', stiffness: 300, damping: 20 }}
      >
        {/* The tumbling cube */}
        <motion.div
          key={`cube-${rollId}`}
          className="absolute inset-0"
          style={{ transformStyle: 'preserve-3d' }}
          initial={false}
          animate={
            rolling
              ? { rotateX: rx, rotateY: ry, rotateZ: rz }
              : { rotateX: base.x, rotateY: base.y, rotateZ: 0 }
          }
          transition={rolling ? t(DICE_ROLL_MS) : { type: 'spring', stiffness: 260, damping: 26 }}
        >
          {Object.keys(places).map((face) => (
            <div
              key={face}
              className="absolute inset-0 flex items-center justify-center"
              style={{
                transform: places[face],
                background: 'linear-gradient(145deg, #fffefb 0%, #f4f1e8 48%, #e4dfd0 100%)',
                borderRadius: radius,
                boxShadow:
                  'inset 0 0 ' + size * 0.06 + 'px rgba(255,255,255,0.9), ' +
                  'inset -' + size * 0.05 + 'px -' + size * 0.05 + 'px ' + size * 0.12 + 'px rgba(0,0,0,0.18), ' +
                  'inset ' + size * 0.04 + 'px ' + size * 0.04 + 'px ' + size * 0.1 + 'px rgba(255,255,255,0.7)',
                filter: FACE_SHADE[face],
                backfaceVisibility: 'hidden',
              }}
            >
              {/* glossy reflection sweep */}
              <span
                className="absolute inset-0 pointer-events-none"
                style={{
                  borderRadius: radius,
                  background:
                    'linear-gradient(135deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0) 42%, rgba(255,255,255,0) 70%, rgba(255,255,255,0.12) 100%)',
                }}
              />
              <Pips value={FACE_VALUE[face]} size={size} />
            </div>
          ))}
        </motion.div>

        {/* Faux motion-blur halo over the spinning cube (kept off the 3-D cube so
            its preserve-3d faces aren't flattened by a CSS filter). */}
        <motion.div
          key={`blur-${rollId}`}
          className="absolute inset-0 pointer-events-none"
          style={{
            borderRadius: radius,
            background: 'radial-gradient(closest-side, rgba(244,241,232,0.85), rgba(244,241,232,0))',
            filter: `blur(${size * 0.13}px)`,
          }}
          initial={false}
          animate={rolling ? { opacity: ghost } : { opacity: 0 }}
          transition={rolling ? t(DICE_ROLL_MS) : { duration: 0.2 }}
        />
      </motion.div>
    </div>
  );
});

Dice3D.displayName = 'Dice3D';
