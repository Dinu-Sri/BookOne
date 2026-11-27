'use client';

import { ChevronDown, ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { navHint } from '@/lib/nav-hints';
import { isDocumentationItem, type NavItem, type NavSuite } from '@/lib/nav-suites';

/**
 * Wraps a menu icon. Resting the pointer on the icon (not the text or the row) shows a short
 * plain explanation beside it, and the icon takes the brand colour.
 */
export function NavIconHint({ label, hint, children }: { label: string; hint?: string | null; children: ReactNode }) {
  const ref = useRef<HTMLSpanElement>(null);
  const bubble = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  // Keep the bubble inside the window: near the bottom (e.g. the docs button) it moves up.
  useLayoutEffect(() => {
    const el = bubble.current;
    if (!pos || !el) return;
    const h = el.offsetHeight;
    const maxTop = window.innerHeight - h - 12;
    if (pos.top > maxTop) setPos({ left: pos.left, top: Math.max(8, maxTop) });
  }, [pos]);
  const text = hint ?? navHint(label);
  useEffect(() => {
    if (!pos) return;
    const hide = () => setPos(null);
    window.addEventListener('scroll', hide, true);
    return () => window.removeEventListener('scroll', hide, true);
  }, [pos]);
  if (!text) return <>{children}</>;
  function show() {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    const left = Math.min(r.right + 12, window.innerWidth - 260);
    setPos({ left, top: Math.max(8, r.top + r.height / 2 - 26) });
  }
  return (
    <span ref={ref} className="nav-icon-hint" onMouseEnter={show} onMouseLeave={() => setPos(null)}>
      {children}
      {pos && typeof document !== 'undefined'
        ? createPortal(
            <div ref={bubble} className="status-tip-bubble nav-hint-bubble" role="tooltip" style={{ position: 'fixed', left: pos.left, top: pos.top, zIndex: 95 }}>
              <strong>{label}</strong>
              <p>{text}</p>
            </div>,
            document.body,
          )
        : null}
    </span>
  );
}

function itemTitle(item: NavItem): string {
  return item.label;
}

function WorkspaceNavTarget({
  item,
  className,
  title,
  isActive,
  children,
}: {
  item: NavItem;
  className: string;
  title: string;
  isActive: boolean;
  children: React.ReactNode;
}) {
  if (!item.href) {
    return (
      <span className={`${className} disabled`} title={`${title} coming soon`}>
        {children}
      </span>
    );
  }
  if (isDocumentationItem(item)) {
    return (
      <a
        className={className}
        href={item.href}
        target="_blank"
        rel="noopener noreferrer"
        title={`${title} (opens in a new tab)`}
        aria-label="Documentation (opens in a new tab)"
        aria-current={isActive ? 'page' : undefined}
      >
        {children}
      </a>
    );
  }
  return (
    <Link className={className} href={item.href} aria-current={isActive ? 'page' : undefined}>
      {children}
    </Link>
  );
}

function NavItemBody({ item }: { item: NavItem }) {
  return (
    <>
      <NavIconHint label={item.label}>
        <item.icon size={16} aria-hidden />
      </NavIconHint>
      <span className="nav-item-text">
        <span className="nav-item-label">{item.label}</span>
      </span>
      {isDocumentationItem(item) ? <ExternalLink className="nav-external-icon" size={12} aria-hidden /> : null}
      {!item.href ? <em>Soon</em> : null}
    </>
  );
}

export function ListSuiteNav({
  suites,
  active,
  openSuite,
  onOpenSuite,
}: {
  suites: NavSuite[];
  active: string;
  openSuite: string;
  onOpenSuite: (id: string) => void;
}) {
  return (
    <nav aria-label="Suite navigation">
      {suites.map((suite) => {
        const isOpen = openSuite === suite.id;
        const hasActiveItem = suite.items.some((item) => item.label === active);
        return (
          <div className={`suite-group ${isOpen ? 'open' : ''}`} key={suite.id}>
            <button
              className={`suite-trigger ${hasActiveItem ? 'active' : ''}`}
              type="button"
              aria-expanded={isOpen}
              aria-controls={`suite-panel-${suite.id}`}
              onClick={() => onOpenSuite(isOpen ? '' : suite.id)}
            >
              <NavIconHint label={suite.label}>
                <suite.icon size={17} aria-hidden />
              </NavIconHint>
              <span>{suite.label}</span>
              <ChevronDown className="suite-chevron" size={15} aria-hidden />
            </button>
            <div
              className="suite-panel"
              id={`suite-panel-${suite.id}`}
              inert={!isOpen ? true : undefined}
              aria-hidden={!isOpen}
            >
              <div className="suite-panel-inner">
                <div className="nav-list" aria-label={`${suite.label} navigation`}>
                  {suite.items.map((item) => {
                    const isActive = item.label === active;
                    const title = itemTitle(item);
                    return (
                      <WorkspaceNavTarget
                        key={item.label}
                        item={item}
                        isActive={isActive}
                        title={title}
                        className={`nav-item nav-child ${isActive ? 'active' : ''}`}
                      >
                        <NavItemBody item={item} />
                      </WorkspaceNavTarget>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </nav>
  );
}
