'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Bold,
  Heading2,
  Italic,
  Link2,
  List,
  ListOrdered,
  Maximize2,
  Underline,
} from 'lucide-react';
import { Button } from '@/components/ui/bookone-ui';
import { sanitizeProductHtml } from '@/lib/product-html';

function Toolbar({ run }: { run: (command: string, value?: string) => void }) {
  return (
    <div className="rich-text-toolbar" onMouseDown={(e) => e.preventDefault()}>
      <button type="button" title="Bold" onClick={() => run('bold')}>
        <Bold size={14} />
      </button>
      <button type="button" title="Italic" onClick={() => run('italic')}>
        <Italic size={14} />
      </button>
      <button type="button" title="Underline" onClick={() => run('underline')}>
        <Underline size={14} />
      </button>
      <button type="button" title="Heading" onClick={() => run('formatBlock', 'h3')}>
        <Heading2 size={14} />
      </button>
      <button type="button" title="Bullet list" onClick={() => run('insertUnorderedList')}>
        <List size={14} />
      </button>
      <button type="button" title="Numbered list" onClick={() => run('insertOrderedList')}>
        <ListOrdered size={14} />
      </button>
      <button
        type="button"
        title="Link"
        onClick={() => {
          const url = window.prompt('Link URL', 'https://');
          if (url) run('createLink', url);
        }}
      >
        <Link2 size={14} />
      </button>
    </div>
  );
}

export function RichTextEditor({
  label,
  hint,
  name,
  value,
  onChange,
  compact,
  placeholder,
  onOpenPopup,
}: {
  label: string;
  hint?: string;
  name: string;
  value: string;
  onChange: (html: string) => void;
  compact?: boolean;
  placeholder?: string;
  onOpenPopup?: () => void;
}) {
  const surfaceRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = surfaceRef.current;
    if (!el) return;
    if (el.innerHTML !== (value || '')) el.innerHTML = value || '';
  }, [value]);

  function run(command: string, arg?: string) {
    surfaceRef.current?.focus();
    document.execCommand(command, false, arg);
    onChange(sanitizeProductHtml(surfaceRef.current?.innerHTML ?? ''));
  }

  return (
    <div className={`field field-full rich-text-field ${compact ? 'is-compact' : ''}`}>
      <div className="rich-text-label-row">
        <label>{label}</label>
        {onOpenPopup ? (
          <button type="button" className="button ghost rich-text-expand" onClick={onOpenPopup}>
            <Maximize2 size={14} />
            Edit in popup
          </button>
        ) : null}
      </div>
      {hint ? <p className="party-hint">{hint}</p> : null}
      <Toolbar run={run} />
      <div
        ref={surfaceRef}
        className="rich-text-surface input"
        contentEditable
        role="textbox"
        data-placeholder={placeholder ?? 'Write here…'}
        onInput={() => onChange(sanitizeProductHtml(surfaceRef.current?.innerHTML ?? ''))}
      />
      <textarea name={name} value={value} hidden readOnly />
    </div>
  );
}

export function RichTextPopup({
  open,
  title,
  hint,
  value,
  onCancel,
  onSave,
}: {
  open: boolean;
  title: string;
  hint?: string;
  value: string;
  onCancel: () => void;
  onSave: (html: string) => void;
}) {
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    if (open) setDraft(value);
  }, [open, value]);

  if (!open) return null;

  return (
    <div className="modal-backdrop" role="presentation" onClick={onCancel}>
      <div
        className="modal-panel rich-text-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="rich-text-popup-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="rich-text-popup-title" className="modal-title">
          {title}
        </h2>
        <RichTextEditor label={title} hint={hint} name="_popup_html" value={draft} onChange={setDraft} />
        <div className="modal-actions">
          <Button variant="secondary" type="button" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="primary" type="button" onClick={() => onSave(sanitizeProductHtml(draft))}>
            Save text
          </Button>
        </div>
      </div>
    </div>
  );
}
