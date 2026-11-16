'use client';

import { ChevronDown, ChevronLeft, ExternalLink, LayoutGrid, List } from 'lucide-react';
import Link from 'next/link';
import type { NavMode } from '@/lib/nav-preference';
import { isDocumentationItem, type NavItem, type NavSuite } from '@/lib/nav-suites';

function itemTitle(item: NavItem): string {
  return item.subtitle ? `${item.label} (${item.subtitle})` : item.label;
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
    <Link className={className} href={item.href} title={title} aria-current={isActive ? 'page' : undefined}>
      {children}
    </Link>
  );
}

function NavItemBody({
  item,
  accessLevel,
  showNewTabHint,
}: {
  item: NavItem;
  accessLevel?: 'none' | 'read' | 'write';
  showNewTabHint?: boolean;
}) {
  return (
    <>
      <item.icon size={16} aria-hidden />
      <span className="nav-item-text">
        <span className="nav-item-label">{item.label}</span>
        {item.subtitle ? <span className="nav-item-sub">{item.subtitle}</span> : null}
        {accessLevel === 'read' ? <span className="nav-item-sub">View only</span> : null}
        {showNewTabHint && isDocumentationItem(item) ? (
          <span className="nav-item-sub nav-new-tab-hint">Opens in a new tab</span>
        ) : null}
      </span>
      {isDocumentationItem(item) ? <ExternalLink className="nav-external-icon" size={12} aria-hidden /> : null}
      {!item.href ? <em>Soon</em> : null}
    </>
  );
}

export function NavModeToggle({
  mode,
  collapsed,
  onChange,
}: {
  mode: NavMode;
  collapsed: boolean;
  onChange: (mode: NavMode) => void;
}) {
  return (
    <div className="nav-mode-toggle" role="group" aria-label="Sidebar layout">
      <button
        type="button"
        className={mode === 'list' ? 'is-selected' : ''}
        aria-pressed={mode === 'list'}
        title="List navigation"
        aria-label="List navigation"
        onClick={() => onChange('list')}
      >
        <List size={14} aria-hidden />
        {collapsed ? null : <span>List</span>}
      </button>
      <button
        type="button"
        className={mode === 'tiles' ? 'is-selected' : ''}
        aria-pressed={mode === 'tiles'}
        title="Tiles navigation"
        aria-label="Tiles navigation"
        onClick={() => onChange('tiles')}
      >
        <LayoutGrid size={14} aria-hidden />
        {collapsed ? null : <span>Tiles</span>}
      </button>
    </div>
  );
}

export function ListSuiteNav({
  suites,
  active,
  openSuite,
  onOpenSuite,
  accessByLabel,
}: {
  suites: NavSuite[];
  active: string;
  openSuite: string;
  onOpenSuite: (id: string) => void;
  accessByLabel?: Record<string, 'none' | 'read' | 'write'>;
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
              title={suite.label}
              aria-expanded={isOpen}
              aria-controls={`suite-panel-${suite.id}`}
              onClick={() => onOpenSuite(isOpen ? '' : suite.id)}
            >
              <suite.icon size={17} aria-hidden />
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
                        className={`nav-item nav-child ${item.subtitle ? 'nav-child-multi' : ''} ${isActive ? 'active' : ''}`}
                      >
                        <NavItemBody
                          item={item}
                          accessLevel={accessByLabel?.[item.label]}
                          showNewTabHint
                        />
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

export function TileSuiteNav({
  suites,
  active,
  tileSuiteId,
  onTileSuite,
  accessByLabel,
}: {
  suites: NavSuite[];
  active: string;
  tileSuiteId: string | null;
  onTileSuite: (id: string | null) => void;
  accessByLabel?: Record<string, 'none' | 'read' | 'write'>;
}) {
  const openSuite = suites.find((suite) => suite.id === tileSuiteId) ?? null;

  if (!openSuite) {
    return (
      <nav aria-label="Suite tiles">
        <div className="nav-tile-grid">
          {suites.map((suite) => {
            const hasActiveItem = suite.items.some((item) => item.label === active);
            return (
              <button
                key={suite.id}
                type="button"
                className={`nav-tile ${hasActiveItem ? 'active' : ''}`}
                title={suite.label}
                aria-label={suite.label}
                onClick={() => onTileSuite(suite.id)}
              >
                <suite.icon size={20} aria-hidden />
                <span className="nav-tile-label">{suite.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    );
  }

  return (
    <nav aria-label={`${openSuite.label} tiles`}>
      <div className="nav-tile-crumb">
        <button
          type="button"
          className="nav-tile nav-tile-back"
          onClick={() => onTileSuite(null)}
          aria-label="Back to all sections"
          title="Back to all sections"
        >
          <ChevronLeft size={18} aria-hidden />
          <span className="nav-tile-label">Back / All sections</span>
        </button>
        <p className="nav-tile-heading">{openSuite.label}</p>
      </div>
      <div className="nav-tile-grid">
        {openSuite.items.map((item) => {
          const isActive = item.label === active;
          const title = itemTitle(item);
          const readOnly = accessByLabel?.[item.label] === 'read';
          const docs = isDocumentationItem(item);
          return (
            <WorkspaceNavTarget
              key={item.label}
              item={item}
              isActive={isActive}
              title={docs ? `${title} (opens in a new tab)` : title}
              className={`nav-tile ${isActive ? 'active' : ''} ${item.href ? '' : 'disabled'}`}
            >
              <item.icon size={20} aria-hidden />
              <span className="nav-tile-label">{item.label}</span>
              {item.subtitle ? <span className="nav-tile-sub">{item.subtitle}</span> : null}
              {readOnly ? <span className="nav-tile-sub">View only</span> : null}
              {docs ? <span className="nav-tile-sub">Opens in a new tab</span> : null}
            </WorkspaceNavTarget>
          );
        })}
      </div>
    </nav>
  );
}
