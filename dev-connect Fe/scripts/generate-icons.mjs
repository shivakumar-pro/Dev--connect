import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const RES = resolve('android/app/src/main/res');

const defs = `
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#3a3a3e"/>
      <stop offset="1" stop-color="#0c0c0e"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.5" cy="0.5" r="0.6">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.16"/>
      <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="body" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffffff"/>
      <stop offset="0.5" stop-color="#d4d4d8"/>
      <stop offset="1" stop-color="#9b9ba3"/>
    </linearGradient>
  </defs>`;

const DARK = '#171719';

// Controller (no glow) — body + D-pad + ABXY + thumbsticks.
const controllerCore = `
  <path d="M 338 410
           Q 512 388 686 410
           C 760 410 806 452 814 524
           C 826 612 792 664 726 648
           C 672 634 632 600 566 598
           Q 512 596 458 598
           C 392 600 352 634 298 648
           C 232 664 198 612 210 524
           C 218 452 264 410 338 410 Z"
        fill="url(#body)" stroke="#ffffff" stroke-width="3" stroke-opacity="0.4"/>
  <path d="M 360 432 Q 512 412 664 432" fill="none" stroke="#ffffff" stroke-width="10" stroke-linecap="round" opacity="0.35"/>
  <g fill="${DARK}">
    <rect x="348" y="452" width="34" height="104" rx="10"/>
    <rect x="313" y="487" width="104" height="34" rx="10"/>
  </g>
  <g fill="${DARK}">
    <circle cx="664" cy="450" r="24"/>
    <circle cx="664" cy="556" r="24"/>
    <circle cx="611" cy="503" r="24"/>
    <circle cx="717" cy="503" r="24"/>
  </g>
  <g>
    <circle cx="432" cy="600" r="46" fill="${DARK}"/>
    <circle cx="432" cy="600" r="24" fill="#5b5b63"/>
    <circle cx="592" cy="600" r="46" fill="${DARK}"/>
    <circle cx="592" cy="600" r="24" fill="#5b5b63"/>
  </g>`;

// scale around the tile centre (512, 520)
const scaleAround = (s) => `translate(${512 * (1 - s)},${520 * (1 - s)}) scale(${s})`;

// Legacy / full icon: dark tile + glow + controller (slightly larger).
const legacySvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">${defs}
  <rect width="1024" height="1024" rx="210" fill="url(#bg)"/>
  <circle cx="512" cy="520" r="330" fill="url(#glow)"/>
  <g transform="${scaleAround(1.16)}">${controllerCore}</g>
</svg>`;

// Adaptive foreground: transparent, controller kept inside the safe zone.
const foregroundSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">${defs}
  <g transform="${scaleAround(1.06)}">${controllerCore}</g>
</svg>`;

const densities = {
  'mipmap-mdpi':    { legacy: 48,  fg: 108 },
  'mipmap-hdpi':    { legacy: 72,  fg: 162 },
  'mipmap-xhdpi':   { legacy: 96,  fg: 216 },
  'mipmap-xxhdpi':  { legacy: 144, fg: 324 },
  'mipmap-xxxhdpi': { legacy: 192, fg: 432 },
};

const render = async (svg, size, outPath) => {
  mkdirSync(dirname(outPath), { recursive: true });
  await sharp(Buffer.from(svg), { density: 384 })
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(outPath);
};

for (const [dir, { legacy, fg }] of Object.entries(densities)) {
  await render(legacySvg, legacy, `${RES}/${dir}/ic_launcher.png`);
  await render(legacySvg, legacy, `${RES}/${dir}/ic_launcher_round.png`);
  await render(foregroundSvg, fg, `${RES}/${dir}/ic_launcher_foreground.png`);
  console.log(`✓ ${dir}  (launcher ${legacy}px, foreground ${fg}px)`);
}

await render(legacySvg, 512, resolve('resources/icon-512.png'));
console.log('✓ resources/icon-512.png (store icon)');
console.log('Done.');
