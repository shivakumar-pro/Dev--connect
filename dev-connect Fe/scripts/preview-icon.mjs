import sharp from 'sharp';
import { resolve } from 'node:path';
import { mkdirSync } from 'node:fs';

const defs = `
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#3a3a3e"/>
      <stop offset="1" stop-color="#0c0c0e"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.5" cy="0.5" r="0.6">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.18"/>
      <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="body" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffffff"/>
      <stop offset="0.5" stop-color="#d4d4d8"/>
      <stop offset="1" stop-color="#9b9ba3"/>
    </linearGradient>
  </defs>`;

// Modern game controller silhouette (silver) with black cut-out controls.
const DARK = '#171719';
const controller = `
  <circle cx="512" cy="520" r="330" fill="url(#glow)"/>

  <!-- body -->
  <path d="M 338 410
           Q 512 388 686 410
           C 760 410 806 452 814 524
           C 826 612 792 664 726 648
           C 672 634 632 600 566 598
           Q 512 596 458 598
           C 392 600 352 634 298 648
           C 232 664 198 612 210 524
           C 218 452 264 410 338 410 Z"
        fill="url(#body)" stroke="#fff3d6" stroke-width="3" stroke-opacity="0.4"/>

  <!-- top sheen -->
  <path d="M 360 432 Q 512 412 664 432" fill="none" stroke="#ffffff" stroke-width="10" stroke-linecap="round" opacity="0.35"/>

  <!-- D-pad (left) -->
  <g fill="${DARK}">
    <rect x="348" y="452" width="34" height="104" rx="10"/>
    <rect x="313" y="487" width="104" height="34" rx="10"/>
  </g>

  <!-- ABXY buttons (right) -->
  <g fill="${DARK}">
    <circle cx="664" cy="450" r="24"/>
    <circle cx="664" cy="556" r="24"/>
    <circle cx="611" cy="503" r="24"/>
    <circle cx="717" cy="503" r="24"/>
  </g>

  <!-- thumbsticks -->
  <g>
    <circle cx="432" cy="600" r="46" fill="${DARK}"/>
    <circle cx="432" cy="600" r="24" fill="#5b5b63"/>
    <circle cx="592" cy="600" r="46" fill="${DARK}"/>
    <circle cx="592" cy="600" r="24" fill="#5b5b63"/>
  </g>`;

// Scale the controller up ~16% around the tile center for a larger look.
const scaled = `<g transform="translate(-81.92,-83.2) scale(1.16)">${controller}</g>`;
const fullSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">${defs}<rect width="1024" height="1024" rx="210" fill="url(#bg)"/>${scaled}</svg>`;

mkdirSync(resolve('resources'), { recursive: true });
await sharp(Buffer.from(fullSvg), { density: 384 }).resize(512, 512).png().toFile(resolve('resources/icon-preview.png'));
console.log('Preview written to: resources/icon-preview.png');
