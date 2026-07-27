'use client';

import { useState } from 'react';
import Link from 'next/link';
import { CashbookShell } from '@/components/cashbook/cashbook-shell';
import { gloss, readSiGlossPreference, writeSiGlossPreference } from '@/lib/si-gloss';

export default function CashbookSettingsPage() {
  const [si, setSi] = useState(() => readSiGlossPreference());

  return (
    <CashbookShell title="Settings" active="settings" si={si}>
      <div className="cashbook-entry-card">
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
        <Link href="/" className="linkish">
          Open full BookOne (advanced)
        </Link>
      </div>
    </CashbookShell>
  );
}
