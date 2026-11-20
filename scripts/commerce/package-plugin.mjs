import { createHash } from 'node:crypto';
import { createWriteStream, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const src = path.join(root, 'connectors/woocommerce/bookone-commerce');
const outDir = path.join(root, 'connectors/woocommerce/release');
const zipPath = path.join(outDir, 'bookone-commerce-1.0.0.zip');

mkdirSync(outDir, { recursive: true });

function files(dir, prefix = 'bookone-commerce') {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    const rel = `${prefix}/${name}`;
    if (statSync(full).isDirectory()) out.push(...files(full, rel));
    else out.push({ full, rel });
  }
  return out;
}

const listed = files(src);
function pack() {
  if (process.platform === 'win32') {
    return spawnSync(
      'powershell',
      ['-NoProfile', '-Command', `Compress-Archive -Path '${src}' -DestinationPath '${zipPath}' -Force`],
      { cwd: root },
    );
  }
  const zip = spawnSync('zip', ['-r', zipPath, 'bookone-commerce'], { cwd: path.dirname(src) });
  if (zip.status === 0) return zip;
  return spawnSync('tar', ['--format=zip', '-cf', zipPath, '-C', path.dirname(src), 'bookone-commerce'], { cwd: root });
}
const packed = pack();
if (packed.status !== 0) {
  console.error(String(packed.stderr || packed.stdout || 'plugin zip failed'));
  process.exit(1);
}

const buf = readFileSync(zipPath);
const sha = createHash('sha256').update(buf).digest('hex');
writeFileSync(path.join(outDir, 'SHA256SUMS'), `${sha}  bookone-commerce-1.0.0.zip\n`);
writeFileSync(
  path.join(outDir, 'checksum.json'),
  JSON.stringify({ file: 'bookone-commerce-1.0.0.zip', sha256: sha, bytes: buf.length, files: listed.map((f) => f.rel) }, null, 2),
);
console.log(`Wrote ${zipPath}`);
console.log(`sha256 ${sha}`);
