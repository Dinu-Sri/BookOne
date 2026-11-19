'use client';

import { ChevronDown } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { menuPosition, type MenuPosition } from '@/components/ui/menu-position';

export type SelectOption = {
  value: string;
  label: string;
  disabled?: boolean;
  description?: string;
};

export function SelectField({
  id,
  name,
  label,
  value,
  onChange,
  options,
  placeholder = 'Select…',
  help,
  error,
  required,
  disabled,
  disabledReason,
  emptyReason,
  searchable,
  className,
}: {
  id: string;
  name?: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  help?: string;
  error?: string;
  required?: boolean;
  disabled?: boolean;
  disabledReason?: string;
  emptyReason?: string;
  searchable?: boolean;
  className?: string;
}) {
  const listId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [pos, setPos] = useState<MenuPosition | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const showSearch = searchable ?? options.length >= 8;
  const selected = options.find((row) => row.value === value);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (row) => row.label.toLowerCase().includes(q) || row.value.toLowerCase().includes(q) || (row.description ?? '').toLowerCase().includes(q),
    );
  }, [options, query]);

  useEffect(() => {
    if (!open) return;
    const idx = Math.max(0, filtered.findIndex((row) => row.value === value));
    setActive(idx);
    const id = window.requestAnimationFrame(() => {
      if (showSearch) searchRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(id);
  }, [open, filtered, value, showSearch]);

  useEffect(() => {
    if (!open || !triggerRef.current) return;
    function place() {
      if (!triggerRef.current) return;
      setPos(menuPosition(triggerRef.current.getBoundingClientRect(), { menuWidth: Math.max(triggerRef.current.offsetWidth, 240) }));
    }
    place();
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    function onScroll() {
      setOpen(false);
    }
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', onScroll);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onScroll);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [open]);

  function pick(next: SelectOption) {
    if (next.disabled) return;
    onChange(next.value);
    setOpen(false);
    setQuery('');
    triggerRef.current?.focus();
  }

  function onTriggerKey(e: React.KeyboardEvent<HTMLButtonElement>) {
    if (disabled) return;
    if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setOpen(true);
    }
  }

  function onListKey(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => Math.min(filtered.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const hit = filtered[active];
      if (hit) pick(hit);
    } else if (e.key === 'Tab') {
      setOpen(false);
    }
  }

  const helpId = help ? `${id}-help` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [helpId, errorId].filter(Boolean).join(' ') || undefined;
  const noOptions = options.length === 0;
  const locked = Boolean(disabled) || noOptions;

  const panel =
    mounted && open && pos && !locked
      ? createPortal(
          <div
            className={`select-field-panel ${pos.openUp ? 'open-up' : ''}`}
            role="listbox"
            id={listId}
            style={{
              position: 'fixed',
              top: pos.top,
              left: pos.left,
              width: Math.max(triggerRef.current?.offsetWidth ?? 220, 240),
              maxHeight: pos.maxHeight,
              transform: pos.openUp ? 'translateY(-100%)' : undefined,
              zIndex: 320,
            }}
            onMouseDown={(e) => e.preventDefault()}
            onKeyDown={onListKey}
          >
            {showSearch ? (
              <input
                ref={searchRef}
                className="input select-field-search"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setActive(0);
                }}
                placeholder="Search"
                aria-label={`Search ${label}`}
              />
            ) : null}
            {filtered.length === 0 ? (
              <div className="select-field-empty">No matches for “{query}”.</div>
            ) : (
              filtered.map((row, index) => (
                <button
                  key={row.value || `opt-${index}`}
                  type="button"
                  role="option"
                  id={`${id}-opt-${index}`}
                  aria-selected={row.value === value}
                  disabled={row.disabled}
                  className={`select-field-option${index === active ? ' active' : ''}${row.value === value ? ' selected' : ''}`}
                  onMouseEnter={() => setActive(index)}
                  onClick={() => pick(row)}
                >
                  <span>{row.label}</span>
                  {row.description ? <small>{row.description}</small> : null}
                </button>
              ))
            )}
          </div>,
          document.body,
        )
      : null;

  return (
    <div className={`field select-field ${className ?? ''}`.trim()}>
      <label htmlFor={id}>
        {label}
        {required ? (
          <span className="field-required" aria-hidden>
            {' '}
            *
          </span>
        ) : null}
      </label>
      {name ? <input type="hidden" name={name} value={value} /> : null}
      <button
        ref={triggerRef}
        id={id}
        type="button"
        role="combobox"
        className="input select-field-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open && filtered[active] ? `${id}-opt-${active}` : undefined}
        aria-required={required || undefined}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        disabled={locked}
        onClick={() => {
          if (locked) return;
          setOpen((v) => !v);
        }}
        onKeyDown={onTriggerKey}
      >
        <span className={selected ? '' : 'select-field-placeholder'}>{selected ? selected.label : placeholder}</span>
        <ChevronDown className="select-chevron" size={15} aria-hidden />
      </button>
      {locked && (disabledReason || emptyReason) ? (
        <p className="field-help">{disabled ? disabledReason : emptyReason}</p>
      ) : null}
      {help && !locked ? (
        <p id={helpId} className="field-help">
          {help}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="form-error inline" role="alert">
          {error}
        </p>
      ) : null}
      {open && !locked ? (
        <button type="button" className="select-field-backdrop" aria-label="Close" onClick={() => setOpen(false)} />
      ) : null}
      {panel}
    </div>
  );
}
