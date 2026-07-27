'use client';

import { useState } from 'react';
import Link from 'next/link';
import { CashbookShell } from '@/components/cashbook/cashbook-shell';
import { signOutCurrentUser } from '@/app/actions/auth-session';
import { gloss, readSiGlossPreference, writeSiGlossPreference } from '@/lib/si-gloss';
import type { EntityKind } from '@/lib/entity-kind';

export function CashbookSettingsClient({
  showFullErpLink,
  entityKind,
  tenantName,
}: {
  showFullErpLink: boolean;
  entityKind: EntityKind;
  tenantName: string;
}) {
  const [si, setSi] = useState(() => readSiGlossPreference());

  return (
    <CashbookShell title="Settings" active="settings" si={si}>
      <div className="cashbook-entry-card">
        <p className="onboard-lead" style={{ margin: 0 }}>
          <strong>{tenantName}</strong>
          <br />
          <span style={{ opacity: 0.8 }}>
            {entityKind === 'personal'
              ? 'Personal books'
              : entityKind === 'sole_prop'
                ? 'Sole proprietorship'
                : entityKind}
          </span>
        </p>

        <label style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <input
            type="checkbox"
            checked={si}
            onChange={(e) => {
              setSi(e.target.checked);
              writeSiGlossPreference(e.target.checked);
            }}
          />
          Show Sinhala hints on important words
        </label>
        <p className="onboard-lead" style={{ margin: 0 }}>
          Example: {gloss('money_out', true)}
        </p>

        <Link href="/cashbook" className="linkish">
          ← Back to {gloss('home', si)}
        </Link>

        {showFullErpLink ? (
          <Link href="/" className="linkish">
            Open full BookOne (advanced)
          </Link>
        ) : (
          <p className="onboard-lead" style={{ margin: 0, fontSize: 13, opacity: 0.75 }}>
            Full company tools unlock when you upgrade (sole prop full / company). Your simple
            cashbook keeps everyday books easy.
          </p>
        )}

        <form action={signOutCurrentUser} style={{ marginTop: 8 }}>
          <button type="submit" className="cashbook-tile action out" style={{ width: '100%' }}>
            Log out{si ? ' (ඉවත් වන්න)' : ''}
          </button>
        </form>
      </div>
    </CashbookShell>
  );
}
