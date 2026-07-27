'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { BrandLockup } from '@/components/ui/bookone-ui';
import { completeEntityOnboarding } from '@/app/actions/entity-onboarding';
import { gloss, readSiGlossPreference, writeSiGlossPreference } from '@/lib/si-gloss';
import type { CapabilityTier } from '@/lib/entity-kind';

type Bucket = 'personal' | 'sole_prop' | 'company';

export function OnboardingClient() {
  const router = useRouter();
  const [si, setSi] = useState(false);
  const [bucket, setBucket] = useState<Bucket | null>(null);
  const [soleTier, setSoleTier] = useState<CapabilityTier>('lite');
  const [error, setError] = useState('');
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    setSi(readSiGlossPreference());
  }, []);

  function pick(b: Bucket) {
    setBucket(b);
    setError('');
  }

  function submit() {
    if (!bucket) {
      setError('Choose one option to continue.');
      return;
    }
    startTransition(async () => {
      const res = await completeEntityOnboarding({
        entityKind: bucket,
        capabilityTier: bucket === 'sole_prop' ? soleTier : undefined,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.push(res.homePath);
      router.refresh();
    });
  }

  return (
    <div className="onboard-page">
      <div className="onboard-wrap">
        <BrandLockup />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h1>What are you using BookOne for?</h1>
          <button
            type="button"
            className="cashbook-si-toggle"
            onClick={() => {
              const n = !si;
              setSi(n);
              writeSiGlossPreference(n);
            }}
          >
            {si ? 'SI Γ£ô' : 'SI'}
          </button>
        </div>
        <p className="onboard-lead">
          Pick one. You can grow later (e.g. personal ΓåÆ business). This takes a few seconds.
        </p>

        <div className="onboard-grid">
          <button
            type="button"
            className={`onboard-tile ${bucket === 'personal' ? 'active' : ''}`}
            onClick={() => pick('personal')}
          >
            <span className="emoji">≡ƒæñ</span>
            <strong>
              {gloss('personal', si)}
            </strong>
            <span>My money & tax ΓÇö income, expenses, loans. Simple like Excel.</span>
          </button>
          <button
            type="button"
            className={`onboard-tile ${bucket === 'sole_prop' ? 'active' : ''}`}
            onClick={() => pick('sole_prop')}
          >
            <span className="emoji">≡ƒÅ¬</span>
            <strong>
              {gloss('business', si)} ┬╖ {gloss('sole_prop', si)}
            </strong>
            <span>Me + my shop. Personal and business books together for tax.</span>
          </button>
          <button
            type="button"
            className={`onboard-tile ${bucket === 'company' ? 'active' : ''}`}
            onClick={() => pick('company')}
          >
            <span className="emoji">≡ƒÅó</span>
            <strong>
              {gloss('company', si)} (Pvt Ltd)
            </strong>
            <span>Full company ERP ΓÇö sales, purchase, stock, POS.</span>
          </button>
        </div>

        {bucket === 'sole_prop' ? (
          <div className="onboard-grid" style={{ marginTop: 4 }}>
            <button
              type="button"
              className={`onboard-tile ${soleTier === 'lite' ? 'active' : ''}`}
              onClick={() => setSoleTier('lite')}
            >
              <strong>Start simple</strong>
              <span>Cashbook + lite invoice. No stock/POS yet.</span>
            </button>
            <button
              type="button"
              className={`onboard-tile ${soleTier === 'full' ? 'active' : ''}`}
              onClick={() => setSoleTier('full')}
            >
              <strong>I need stock / POS</strong>
              <span>Turn on full business modules now.</span>
            </button>
          </div>
        ) : null}

        {error ? <p className="onboard-error">{error}</p> : null}

        <div className="onboard-actions">
          <button type="button" className="onboard-continue" disabled={pending || !bucket} onClick={submit}>
            {pending ? 'SavingΓÇª' : gloss('continue', si)}
          </button>
        </div>
      </div>
    </div>
  );
}
