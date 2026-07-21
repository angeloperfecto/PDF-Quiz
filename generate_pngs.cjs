const fs = require('fs');
const sharp = require('sharp');

const svgMain = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#4f46e5" rx="112" />
  <path d="M256 64L128 288h112v160l144-224H272V64z" fill="#ffffff" />
</svg>`;

const svgMask = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <path d="M256 64L128 288h112v160l144-224H272V64z" fill="#000000" />
</svg>`;

if (!fs.existsSync('public')) {
  fs.mkdirSync('public');
}

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
