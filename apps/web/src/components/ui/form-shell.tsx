'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';

export function FormBackLink({
  href,
  parent,
}: {
  href: string;
  parent: string;
}) {
  return (
    <Link href={href} className="party-back-btn">
      <span className="party-back-arrow" aria-hidden>
        ←
      </span>
      <span>
        <strong>Back</strong>
        <small>{parent}</small>
      </span>
    </Link>
  );
}

export function FormShell({
  backHref,
  backParent,
  title,
  children,
  footer,
  size = 'form',
}: {
  backHref: string;
  backParent: string;
  title?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'form' | 'wide';
}) {
  return (
    <div className={`party-form-shell form-shell form-shell-${size}`} style={{ maxHeight: 'none', minHeight: 0 }}>
      <div className="party-form-top">
        <FormBackLink href={backHref} parent={backParent} />
        {title ? <span className="form-shell-title">{title}</span> : null}
      </div>
      <div className="party-form-body">{children}</div>
      {footer}
    </div>
  );
}

export function FormFooter({ children }: { children: ReactNode }) {
  return <div className="party-form-footer">{children}</div>;
}
