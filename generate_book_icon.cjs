const fs = require('fs');
const sharp = require('sharp');

const svgMain = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#4f46e5" rx="112" />
  <!-- Lucide BookOpen icon scaled and centered -->
  <g transform="translate(106, 106) scale(12.5) " fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
    <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
  </g>
</svg>`;

const svgMask = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <g transform="translate(106, 106) scale(12.5)" fill="none" stroke="#000000" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
    <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
  </g>
</svg>`;

fs.writeFileSync('public/icon.svg', svgMain);
fs.writeFileSync('public/safari-pinned-tab.svg', svgMask);

async function generate() {
  await sharp(Buffer.from(svgMain)).resize(16, 16).png().toFile('public/favicon-16x16.png');
  await sharp(Buffer.from(svgMain)).resize(32, 32).png().toFile('public/favicon-32x32.png');
  await sharp(Buffer.from(svgMain)).resize(180, 180).png().toFile('public/apple-touch-icon.png');
  await sharp(Buffer.from(svgMain)).resize(192, 192).png().toFile('public/android-chrome-192x192.png');
  await sharp(Buffer.from(svgMain)).resize(512, 512).png().toFile('public/android-chrome-512x512.png');
  console.log('PNGs generated successfully.');
}

generate();
