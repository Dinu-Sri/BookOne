/**
 * Build a lightweight static docs site from apps/web/content/docs (MDX/Markdown).
 * No Next.js — fast image for docs.bookone.* domains.
 */
import {
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
  statSync,
  existsSync,
  cpSync,
} from 'node:fs';
import { join, dirname, relative, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '../..');
const contentRoot = join(root, 'apps/web/content/docs');
const outDir = join(__dirname, 'dist');
const appUrl = process.env.DOCS_APP_URL || process.env.WEB_PUBLIC_URL || 'https://bookone.clossyan.com';

function walk(dir, acc = []) {
  if (!existsSync(dir)) return acc;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, acc);
    else if (/\.(mdx?|md)$/i.test(name) && name !== 'meta.json') acc.push(p);
  }
  return acc;
}

function stripMdx(src) {
  let s = src;
  // Remove import/export lines common in MDX
  s = s.replace(/^import\s+.+;?\s*$/gm, '');
  s = s.replace(/^export\s+.+;?\s*$/gm, '');
  // JSX-ish components → plain text fallback
  s = s.replace(/<([A-Za-z][\w.]*)([^>]*)\/>/g, '');
  s = s.replace(/<\/?[A-Za-z][\w.]*[^>]*>/g, '');
  return s.trim();
}

function mdToHtml(md) {
  let h = md
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  h = h.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  h = h.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  h = h.replace(/^# (.+)$/gm, '<h1>$1</h1>');
  h = h.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  h = h.replace(/`([^`]+)`/g, '<code>$1</code>');
  h = h.replace(/^\s*[-*]\s+(.+)$/gm, '<li>$1</li>');
  h = h.replace(/(<li>.*<\/li>\n?)+/gs, (m) => `<ul>${m}</ul>`);
  h = h.replace(/^(?!<[hul]|<li|<p|<\/)(.+)$/gm, '<p>$1</p>');
  return h;
}

function pageShell(title, body, navHtml) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title} · BookOne Docs</title>
  <style>
    :root { color-scheme: light dark; --bg:#0f1419; --card:#1a2332; --text:#e7ecf3; --muted:#9aa8bc; --accent:#3b82f6; --border:#2a3648; }
    @media (prefers-color-scheme: light) {
      :root { --bg:#f6f8fb; --card:#fff; --text:#0f172a; --muted:#64748b; --accent:#2563eb; --border:#e2e8f0; }
    }
    * { box-sizing: border-box; }
    body { margin:0; font-family: system-ui,Segoe UI,Roboto,sans-serif; background:var(--bg); color:var(--text); line-height:1.55; }
    header { border-bottom:1px solid var(--border); padding:1rem 1.25rem; display:flex; gap:1rem; flex-wrap:wrap; align-items:center; justify-content:space-between; background:var(--card); }
    header a { color:var(--accent); text-decoration:none; font-weight:600; }
    header .muted { color:var(--muted); font-size:.9rem; }
    .layout { display:grid; grid-template-columns: 240px 1fr; min-height: calc(100vh - 64px); }
    @media (max-width: 800px) { .layout { grid-template-columns: 1fr; } nav { border-right:none; border-bottom:1px solid var(--border); } }
    nav { border-right:1px solid var(--border); padding:1rem; background:var(--card); }
    nav a { display:block; color:var(--text); text-decoration:none; padding:.35rem .5rem; border-radius:6px; font-size:.92rem; }
    nav a:hover { background: var(--border); }
    main { padding:1.5rem 1.75rem 3rem; max-width: 820px; }
    h1,h2,h3 { line-height:1.25; }
    code { background:var(--border); padding:.1rem .35rem; border-radius:4px; font-size:.9em; }
    ul { padding-left: 1.2rem; }
    footer { margin-top:2rem; color:var(--muted); font-size:.85rem; }
  </style>
</head>
<body>
  <header>
    <div><a href="/">BookOne Docs</a> <span class="muted">product help</span></div>
    <div class="muted"><a href="${appUrl}">Open app →</a></div>
  </header>
  <div class="layout">
    <nav>${navHtml}</nav>
    <main>${body}
      <footer>Generated from monorepo <code>apps/web/content/docs</code>. App: <a href="${appUrl}">${appUrl}</a></footer>
    </main>
  </div>
</body>
</html>`;
}

function main() {
  mkdirSync(outDir, { recursive: true });
  const files = walk(contentRoot);
  const pages = [];

  for (const file of files) {
    const rel = relative(contentRoot, file).replace(/\\/g, '/');
    const raw = readFileSync(file, 'utf8');
    const md = stripMdx(raw);
    const titleMatch = md.match(/^#\s+(.+)$/m);
    const title = titleMatch ? titleMatch[1].trim() : rel;
    let urlPath = rel.replace(/\.(mdx|md)$/i, '');
    if (urlPath.endsWith('/index')) urlPath = urlPath.slice(0, -'/index'.length) || 'index';
    if (urlPath === 'index' || urlPath === '') urlPath = '';
    pages.push({ rel, title, urlPath, htmlBody: mdToHtml(md) });
  }

  pages.sort((a, b) => a.urlPath.localeCompare(b.urlPath));

  const navHtml = pages
    .map((p) => {
      const href = p.urlPath ? `/${p.urlPath}/` : '/';
      return `<a href="${href}">${p.title}</a>`;
    })
    .join('\n');

  for (const p of pages) {
    const dir = p.urlPath ? join(outDir, p.urlPath) : outDir;
    mkdirSync(dir, { recursive: true });
    const html = pageShell(p.title, p.htmlBody, navHtml);
    writeFileSync(join(dir, 'index.html'), html, 'utf8');
  }

  // favicon if present
  const fav = join(root, 'apps/web/public/favicon.webp');
  if (existsSync(fav)) cpSync(fav, join(outDir, 'favicon.webp'));

  writeFileSync(
    join(outDir, 'healthz'),
    'ok\n',
    'utf8',
  );

  console.log(`Docs static build: ${pages.length} pages → ${outDir}`);
}

main();
