import { NextResponse } from 'next/server';
import { source } from '@/lib/source';

type SearchHit = {
  id: string;
  type: 'page' | 'text';
  content: string;
  url: string;
};

/**
 * Fast in-process docs search (Fumadocs-compatible hit shape).
 * Avoids Orama init issues on our stack; plenty fast for MDX doc set.
 */
function buildIndex(): SearchHit[] {
  const hits: SearchHit[] = [];
  for (const page of source.getPages()) {
    const title = page.data.title ?? 'Untitled';
    const description =
      typeof page.data.description === 'string' ? page.data.description : '';
    hits.push({
      id: page.url,
      type: 'page',
      content: title,
      url: page.url,
    });
    if (description) {
      hits.push({
        id: `${page.url}#desc`,
        type: 'text',
        content: description,
        url: page.url,
      });
    }
    const structured = page.data.structuredData as
      | {
          headings?: { content?: string; id?: string }[];
          contents?: { content?: string; heading?: string }[];
        }
      | undefined;
    if (Array.isArray(structured?.headings)) {
      for (const h of structured.headings) {
        if (typeof h?.content === 'string' && h.content.trim()) {
          hits.push({
            id: `${page.url}#h-${h.id ?? h.content}`,
            type: 'text',
            content: h.content,
            url: h.id ? `${page.url}#${h.id}` : page.url,
          });
        }
      }
    }
    if (Array.isArray(structured?.contents)) {
      for (const c of structured.contents) {
        if (typeof c?.content === 'string' && c.content.trim()) {
          hits.push({
            id: `${page.url}#c-${c.heading ?? c.content.slice(0, 24)}`,
            type: 'text',
            content: c.content,
            url: c.heading ? `${page.url}#${c.heading}` : page.url,
          });
        }
      }
    }
  }
  return hits;
}

const INDEX = buildIndex();

export function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = (searchParams.get('query') ?? searchParams.get('q') ?? '')
    .trim()
    .toLowerCase();
  if (!query) return NextResponse.json([]);

  const terms = query.split(/\s+/).filter(Boolean);
  const scored = INDEX.map((hit) => {
    const hay = hit.content.toLowerCase();
    let score = 0;
    for (const t of terms) {
      if (hay.includes(t)) score += t.length;
      if (hay.startsWith(t)) score += 5;
    }
    if (hit.type === 'page' && score > 0) score += 10;
    return { hit, score };
  })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 24)
    .map(({ hit }) => hit);

  return NextResponse.json(scored);
}
