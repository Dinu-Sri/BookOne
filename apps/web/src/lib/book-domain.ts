const STORAGE_KEY = 'bookone.bookDomain';

export type BookDomainPref = 'personal' | 'business';

export function readBookDomainPref(fallback: BookDomainPref = 'personal'): BookDomainPref {
  if (typeof window === 'undefined') return fallback;
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    if (v === 'personal' || v === 'business') return v;
  } catch {
    /* ignore */
  }
  return fallback;
}

export function writeBookDomainPref(domain: BookDomainPref) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, domain);
  } catch {
    /* ignore */
  }
}
