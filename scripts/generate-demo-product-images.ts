import { mkdir, writeFile } from 'fs/promises';
import path from 'path';
import sharp from 'sharp';

const demo = [
  ['phy-paint-01.webp', 'Paint 4L', '#1677c9', '#0d5fa8'],
  ['phy-brush-02.webp', 'Brush Set', '#15835f', '#0f6a4c'],
  ['phy-roller-03.webp', 'Roller', '#a76612', '#8a5210'],
  ['phy-thin-04.webp', 'Thinner', '#5855b8', '#4542a0'],
  ['phy-tape-05.webp', 'Tape', '#c94141', '#a83333'],
  ['dig-lic-06.webp', 'License', '#0d5fa8', '#083a67'],
  ['dig-ebook-07.webp', 'eBook', '#15835f', '#0b5c42'],
  ['dig-temp-08.webp', 'Templates', '#a76612', '#7a4a0e'],
  ['srv-inst-09.webp', 'Install', '#5855b8', '#3d3a9a'],
  ['srv-cons-10.webp', 'Consult', '#c94141', '#9c3232'],
] as const;

async function main() {
  const dir = path.join(process.cwd(), 'apps', 'web', 'public', 'products', 'demo');
  await mkdir(dir, { recursive: true });
  for (const [file, label, bg, accent] of demo) {
    const svg = `<svg width="400" height="400" xmlns="http://www.w3.org/2000/svg">
      <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${bg}"/><stop offset="100%" stop-color="${accent}"/>
      </linearGradient></defs>
      <rect width="400" height="400" fill="url(#g)"/>
      <circle cx="200" cy="148" r="70" fill="rgba(255,255,255,0.16)"/>
      <rect x="70" y="248" width="260" height="84" rx="18" fill="rgba(0,0,0,0.18)"/>
      <text x="200" y="298" text-anchor="middle" font-family="Arial,sans-serif" font-size="26" font-weight="700" fill="#ffffff">${label}</text>
    </svg>`;
    const buf = await sharp(Buffer.from(svg)).webp({ quality: 80 }).toBuffer();
    await writeFile(path.join(dir, file), buf);
    console.log('wrote', file, buf.length, 'bytes');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
