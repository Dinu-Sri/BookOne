'use client';

import { useEffect, type ReactNode } from 'react';

const DOCS_ROOT_ID = 'bookone-docs';

function bookoneHtmlClasses(from: string): string[] {
  return from
    .split(/\s+/)
    .filter((cls) => cls && cls !== 'dark' && cls !== 'light');
}

/**
 * Isolate Fumadocs/next-themes from the business shell.
 * next-themes may rewrite html.className; keep BookOne font variables, mirror
 * dark/light onto #bookone-docs, and restore html on unmount (history Back).
 */
export function DocsThemeBoundary({ children }: { children: ReactNode }) {
  useEffect(() => {
    const html = document.documentElement;
    const previousClass = html.className;
    const previousScheme = html.style.colorScheme;
    const previousTheme = html.getAttribute('data-theme');
    const preserved = bookoneHtmlClasses(previousClass);
    const root = document.getElementById(DOCS_ROOT_ID);

    const sync = () => {
      // A no-op DOMTokenList.add can still enqueue a class mutation in Chromium.
      // Only write if needed so the observer cannot trigger itself indefinitely.
      for (const cls of preserved) {
        if (!html.classList.contains(cls)) html.classList.add(cls);
      }
      if (!html.classList.contains('light') && !html.classList.contains('dark')) {
        html.classList.add('light');
      }
      const dark = html.classList.contains('dark');
      const theme = dark ? 'dark' : 'light';
      if (root && root.classList.contains('dark') !== dark) root.classList.toggle('dark', dark);
      if (root && root.getAttribute('data-theme') !== theme) root.setAttribute('data-theme', theme);
    };

    sync();
    const observer = new MutationObserver(sync);
    observer.observe(html, { attributes: true, attributeFilter: ['class', 'style', 'data-theme'] });

    return () => {
      observer.disconnect();
      html.className = previousClass;
      html.style.colorScheme = previousScheme;
      if (previousTheme == null) html.removeAttribute('data-theme');
      else html.setAttribute('data-theme', previousTheme);
      html.classList.remove('dark');
      if (!html.classList.contains('light')) html.classList.add('light');
    };
  }, []);

  return (
    <div id={DOCS_ROOT_ID} data-bookone-docs="true">
      {children}
    </div>
  );
}
