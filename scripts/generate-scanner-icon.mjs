// Generate app icons for StageNation Scanner
// Run: node scripts/generate-scanner-icon.mjs
import { writeFileSync } from 'fs';

const SIZE = 1024;
const HALF = SIZE / 2;

// Create SVG icon: dark bg with cyan QR frame + scanning line
function generateSvg(size, padding = 0) {
  const bg = '#0f172a';
  const accent = '#22d3ee';
  const accentDark = '#0891b2';

  const inset = size * 0.2 + padding;
  const boxSize = size - inset * 2;
  const cornerLen = boxSize * 0.3;
  const cornerW = size * 0.04;
  const radius = size * 0.03;

  // QR dots in the center
  const dotSize = size * 0.06;
  const gridStart = size * 0.35;
  const gridSpacing = size * 0.075;

  const dots = [];
  const pattern = [
    [1,1,1,0,1],
    [1,0,0,1,0],
    [1,0,1,0,1],
    [0,1,0,0,1],
    [1,0,1,1,1],
  ];

  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 5; col++) {
      if (pattern[row][col]) {
        const x = gridStart + col * gridSpacing;
        const y = gridStart + row * gridSpacing;
        dots.push(`<rect x="${x}" y="${y}" width="${dotSize}" height="${dotSize}" rx="${dotSize * 0.2}" fill="${accent}" opacity="0.7"/>`);
      }
    }
  }

  // Scanning line
  const lineY = size * 0.5;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0f172a"/>
      <stop offset="100%" stop-color="#1e293b"/>
    </linearGradient>
    <linearGradient id="scanLine" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="${accent}" stop-opacity="0"/>
      <stop offset="20%" stop-color="${accent}" stop-opacity="0.8"/>
      <stop offset="50%" stop-color="${accent}" stop-opacity="1"/>
      <stop offset="80%" stop-color="${accent}" stop-opacity="0.8"/>
      <stop offset="100%" stop-color="${accent}" stop-opacity="0"/>
    </linearGradient>
    <filter id="glow">
      <feGaussianBlur stdDeviation="${size * 0.008}" result="blur"/>
      <feComposite in="SourceGraphic" in2="blur" operator="over"/>
    </filter>
  </defs>

  <!-- Background -->
  <rect width="${size}" height="${size}" fill="url(#bgGrad)" rx="${size * 0.22}"/>

  <!-- Subtle circle glow -->
  <circle cx="${HALF}" cy="${HALF}" r="${size * 0.3}" fill="${accent}" opacity="0.05"/>

  <!-- QR dots -->
  ${dots.join('\n  ')}

  <!-- Scanner corners -->
  <!-- Top-left -->
  <path d="M${inset + radius},${inset} L${inset + cornerLen},${inset}" stroke="${accent}" stroke-width="${cornerW}" fill="none" stroke-linecap="round"/>
  <path d="M${inset},${inset + radius} L${inset},${inset + cornerLen}" stroke="${accent}" stroke-width="${cornerW}" fill="none" stroke-linecap="round"/>
  <path d="M${inset},${inset + radius} Q${inset},${inset} ${inset + radius},${inset}" stroke="${accent}" stroke-width="${cornerW}" fill="none"/>

  <!-- Top-right -->
  <path d="M${size - inset - cornerLen},${inset} L${size - inset - radius},${inset}" stroke="${accent}" stroke-width="${cornerW}" fill="none" stroke-linecap="round"/>
  <path d="M${size - inset},${inset + radius} L${size - inset},${inset + cornerLen}" stroke="${accent}" stroke-width="${cornerW}" fill="none" stroke-linecap="round"/>
  <path d="M${size - inset - radius},${inset} Q${size - inset},${inset} ${size - inset},${inset + radius}" stroke="${accent}" stroke-width="${cornerW}" fill="none"/>

  <!-- Bottom-left -->
  <path d="M${inset + radius},${size - inset} L${inset + cornerLen},${size - inset}" stroke="${accent}" stroke-width="${cornerW}" fill="none" stroke-linecap="round"/>
  <path d="M${inset},${size - inset - cornerLen} L${inset},${size - inset - radius}" stroke="${accent}" stroke-width="${cornerW}" fill="none" stroke-linecap="round"/>
  <path d="M${inset},${size - inset - radius} Q${inset},${size - inset} ${inset + radius},${size - inset}" stroke="${accent}" stroke-width="${cornerW}" fill="none"/>

  <!-- Bottom-right -->
  <path d="M${size - inset - cornerLen},${size - inset} L${size - inset - radius},${size - inset}" stroke="${accent}" stroke-width="${cornerW}" fill="none" stroke-linecap="round"/>
  <path d="M${size - inset},${size - inset - cornerLen} L${size - inset},${size - inset - radius}" stroke="${accent}" stroke-width="${cornerW}" fill="none" stroke-linecap="round"/>
  <path d="M${size - inset - radius},${size - inset} Q${size - inset},${size - inset} ${size - inset},${size - inset - radius}" stroke="${accent}" stroke-width="${cornerW}" fill="none"/>

  <!-- Scan line -->
  <rect x="${inset + cornerW}" y="${lineY - size * 0.003}" width="${boxSize - cornerW * 2}" height="${size * 0.006}" fill="url(#scanLine)" filter="url(#glow)"/>

  <!-- S letter hint -->
  <text x="${HALF}" y="${size * 0.85}" font-family="system-ui, -apple-system, sans-serif" font-size="${size * 0.08}" font-weight="700" fill="${accent}" opacity="0.6" text-anchor="middle">SCAN</text>
</svg>`;
}

// Write the main icon SVG
const svg1024 = generateSvg(1024);
writeFileSync('scanner/assets/icon.svg', svg1024);
console.log('Generated scanner/assets/icon.svg');

// For a simpler adaptive icon (just the foreground)
function generateAdaptiveSvg() {
  const size = 1024;
  const accent = '#22d3ee';
  const inset = size * 0.25;
  const boxSize = size - inset * 2;
  const cornerLen = boxSize * 0.3;
  const cornerW = size * 0.05;
  const radius = size * 0.04;
  const lineY = size * 0.5;

  const dotSize = size * 0.055;
  const gridStart = size * 0.36;
  const gridSpacing = size * 0.07;

  const dots = [];
  const pattern = [
    [1,1,1,0,1],
    [1,0,0,1,0],
    [1,0,1,0,1],
    [0,1,0,0,1],
    [1,0,1,1,1],
  ];

  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 5; col++) {
      if (pattern[row][col]) {
        const x = gridStart + col * gridSpacing;
        const y = gridStart + row * gridSpacing;
        dots.push(`<rect x="${x}" y="${y}" width="${dotSize}" height="${dotSize}" rx="${dotSize * 0.2}" fill="${accent}" opacity="0.8"/>`);
      }
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <linearGradient id="scanLine" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="${accent}" stop-opacity="0"/>
      <stop offset="30%" stop-color="${accent}" stop-opacity="1"/>
      <stop offset="70%" stop-color="${accent}" stop-opacity="1"/>
      <stop offset="100%" stop-color="${accent}" stop-opacity="0"/>
    </linearGradient>
  </defs>

  ${dots.join('\n  ')}

  <!-- Corners -->
  <path d="M${inset + radius},${inset} L${inset + cornerLen},${inset}" stroke="${accent}" stroke-width="${cornerW}" fill="none" stroke-linecap="round"/>
  <path d="M${inset},${inset + radius} L${inset},${inset + cornerLen}" stroke="${accent}" stroke-width="${cornerW}" fill="none" stroke-linecap="round"/>
  <path d="M${inset},${inset + radius} Q${inset},${inset} ${inset + radius},${inset}" stroke="${accent}" stroke-width="${cornerW}" fill="none"/>

  <path d="M${size - inset - cornerLen},${inset} L${size - inset - radius},${inset}" stroke="${accent}" stroke-width="${cornerW}" fill="none" stroke-linecap="round"/>
  <path d="M${size - inset},${inset + radius} L${size - inset},${inset + cornerLen}" stroke="${accent}" stroke-width="${cornerW}" fill="none" stroke-linecap="round"/>
  <path d="M${size - inset - radius},${inset} Q${size - inset},${inset} ${size - inset},${inset + radius}" stroke="${accent}" stroke-width="${cornerW}" fill="none"/>

  <path d="M${inset + radius},${size - inset} L${inset + cornerLen},${size - inset}" stroke="${accent}" stroke-width="${cornerW}" fill="none" stroke-linecap="round"/>
  <path d="M${inset},${size - inset - cornerLen} L${inset},${size - inset - radius}" stroke="${accent}" stroke-width="${cornerW}" fill="none" stroke-linecap="round"/>
  <path d="M${inset},${size - inset - radius} Q${inset},${size - inset} ${inset + radius},${size - inset}" stroke="${accent}" stroke-width="${cornerW}" fill="none"/>

  <path d="M${size - inset - cornerLen},${size - inset} L${size - inset - radius},${size - inset}" stroke="${accent}" stroke-width="${cornerW}" fill="none" stroke-linecap="round"/>
  <path d="M${size - inset},${size - inset - cornerLen} L${size - inset},${size - inset - radius}" stroke="${accent}" stroke-width="${cornerW}" fill="none" stroke-linecap="round"/>
  <path d="M${size - inset - radius},${size - inset} Q${size - inset},${size - inset} ${size - inset},${size - inset - radius}" stroke="${accent}" stroke-width="${cornerW}" fill="none"/>

  <!-- Scan line -->
  <rect x="${inset}" y="${lineY - 3}" width="${boxSize}" height="6" fill="url(#scanLine)"/>
</svg>`;
}

const adaptiveSvg = generateAdaptiveSvg();
writeFileSync('scanner/assets/adaptive-icon.svg', adaptiveSvg);
console.log('Generated scanner/assets/adaptive-icon.svg');
