export function sanitizeProductHtml(html?: string | null): string {
  const raw = (html ?? '').trim();
  if (!raw || raw === '<br>' || raw === '<div><br></div>' || raw === '<p><br></p>') return '';
  return raw
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/javascript:/gi, '');
}

export function htmlToPreview(html?: string | null): string {
  return sanitizeProductHtml(html)
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/p>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
