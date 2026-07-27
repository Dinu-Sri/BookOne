'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { CashbookShell } from '@/components/cashbook/cashbook-shell';
import { signOutCurrentUser } from '@/app/actions/auth-session';
import {
  downgradeSoleFullToLite,
  incorporateSoleToCompany,
  upgradePersonalToSoleLite,
  upgradeSoleLiteToFull,
} from '@/app/actions/entity-lifecycle';
import { gloss, readSiGlossPreference, writeSiGlossPreference } from '@/lib/si-gloss';
import { SiToggle } from '@/components/ui/si-toggle';
import type { CapabilityTier, EntityKind } from '@/lib/entity-kind';

export function CashbookSettingsClient({
  showFullErpLink,
  entityKind,
  capabilityTier,
  tenantName,
  canUpgradeToSole,
  canUpgradeToFull,
  canDowngradeToLite,
  canIncorporate,
}: {
  showFullErpLink: boolean;
  entityKind: EntityKind;
  capabilityTier: CapabilityTier | null;
  tenantName: string;
  canUpgradeToSole: boolean;
  canUpgradeToFull: boolean;
  canDowngradeToLite: boolean;
  canIncorporate: boolean;
}) {
  const router = useRouter();
  const [si, setSi] = useState(() => readSiGlossPreference());
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [pending, start] = useTransition();
  const [confirm, setConfirm] = useState<
    null | 'sole' | 'full' | 'lite' | 'incorporate'
  >(null);

  function run(
    kind: 'sole' | 'full' | 'lite' | 'incorporate',
    fn: () => Promise<{ ok: true; homePath: string; message: string } | { ok: false; error: string }>,
  ) {
    start(async () => {
      setError('');
      setInfo('');
      const res = await fn();
      if (!res.ok) {
        setError(res.error);
        setConfirm(null);
        return;
      }
      setInfo(res.message);
      setConfirm(null);
      router.push(res.homePath);
      router.refresh();
    });
  }

  const tierLabel =
    entityKind === 'personal'
      ? 'Personal books'
      : entityKind === 'sole_prop'
        ? `Sole proprietorship · ${capabilityTier === 'full' ? 'Full' : 'Lite'}`
        : entityKind;

  return (
    <CashbookShell
      title={gloss('settings', si)}
      active="settings"
      si={si}
      showFullErpLink={showFullErpLink}
      right={
        <SiToggle
          on={si}
          onChange={(n) => {
            setSi(n);
            writeSiGlossPreference(n);
          }}
        />
      }
    >
      <div className="cashbook-entry-card">
        <p className="onboard-lead" style={{ margin: 0 }}>
          <strong>{tenantName}</strong>
          <br />
          <span style={{ opacity: 0.8 }}>{tierLabel}</span>
        </p>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <span style={{ fontSize: 13, fontWeight: 650 }}>
            {si ? (
              <span className="si-text" lang="si">
                භාෂාව
              </span>
            ) : (
              'Language'
            )}
          </span>
          <SiToggle
            on={si}
            onChange={(n) => {
              setSi(n);
              writeSiGlossPreference(n);
            }}
          />
        </div>
        <p className="onboard-lead" style={{ margin: 0, fontSize: 13 }}>
          {si ? (
            <>
              උදා: <span className="si-text">වියදම</span>
            </>
          ) : (
            <>Example label: Money Out</>
          )}
        </p>

        {showFullErpLink ? (
          <Link href="/" className="linkish">
            {si ? 'සම්පූර්ණ BookOne' : 'Open full BookOne (advanced)'}
          </Link>
        ) : null}
      </div>

      {/* —— Lifecycle —— */}
      <div className="cashbook-entry-card" style={{ marginTop: 12 }}>
        <strong>Grow your workspace</strong>
        <p className="onboard-lead" style={{ margin: 0, fontSize: 13 }}>
          Upgrades keep all history. Journals are never deleted. Company incorporation creates a{' '}
          <em>new</em> company workspace and archives this sole prop for tax history.
        </p>

        {canUpgradeToSole ? (
          <div className="lifecycle-card">
            <div>
              <strong>→ Sole prop (lite)</strong>
              <p>Add a Business book beside Personal. Lite invoices &amp; bills on business domain.</p>
            </div>
            {confirm === 'sole' ? (
              <div className="lifecycle-confirm">
                <p>Upgrade this personal workspace to sole prop lite?</p>
                <div className="cashbook-pay-tiles">
                  <button
                    type="button"
                    className="cashbook-save"
                    disabled={pending}
                    onClick={() => run('sole', () => upgradePersonalToSoleLite())}
                  >
                    {pending ? <Loader2 className="spin" size={16} /> : null}
                    Confirm upgrade
                  </button>
                  <button type="button" className="cashbook-si-toggle" onClick={() => setConfirm(null)}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button type="button" className="cashbook-save" onClick={() => setConfirm('sole')}>
                Upgrade to sole lite
              </button>
            )}
          </div>
        ) : null}

        {canUpgradeToFull ? (
          <div className="lifecycle-card">
            <div>
              <strong>→ Sole prop full</strong>
              <p>Turn on stock, POS, and full sales/purchase suites. Cashbook domain switcher stays.</p>
            </div>
            {confirm === 'full' ? (
              <div className="lifecycle-confirm">
                <p>Enable full business modules on this sole prop?</p>
                <div className="cashbook-pay-tiles">
                  <button
                    type="button"
                    className="cashbook-save"
                    disabled={pending}
                    onClick={() => run('full', () => upgradeSoleLiteToFull())}
                  >
                    {pending ? <Loader2 className="spin" size={16} /> : null}
                    Confirm full modules
                  </button>
                  <button type="button" className="cashbook-si-toggle" onClick={() => setConfirm(null)}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button type="button" className="cashbook-save" onClick={() => setConfirm('full')}>
                Expand to full modules
              </button>
            )}
          </div>
        ) : null}

        {canDowngradeToLite ? (
          <div className="lifecycle-card">
            <div>
              <strong>← Back to sole lite</strong>
              <p>
                Turns off create/edit for stock &amp; POS. You can still <strong>view</strong> past
                products, stock and POS history.
              </p>
            </div>
            {confirm === 'lite' ? (
              <div className="lifecycle-confirm">
                <p>Hide full modules and return to cashbook-first lite?</p>
                <div className="cashbook-pay-tiles">
                  <button
                    type="button"
                    className="cashbook-tile action out"
                    style={{ minHeight: 40 }}
                    disabled={pending}
                    onClick={() => run('lite', () => downgradeSoleFullToLite())}
                  >
                    {pending ? <Loader2 className="spin" size={16} /> : null}
                    Confirm downgrade
                  </button>
                  <button type="button" className="cashbook-si-toggle" onClick={() => setConfirm(null)}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button type="button" className="cashbook-si-toggle" onClick={() => setConfirm('lite')}>
                Downgrade to lite
              </button>
            )}
          </div>
        ) : null}

        {canIncorporate ? (
          <div className="lifecycle-card">
            <div>
              <strong>→ Incorporate as Pvt Ltd</strong>
              <p>
                Creates a <strong>new company</strong> workspace. Posts opening balances from your{' '}
                <em>business</em> domain. This sole workspace is archived (kept for tax history).
              </p>
            </div>
            {confirm === 'incorporate' ? (
              <div className="lifecycle-confirm">
                <label>
                  Company legal name
                  <input
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    placeholder="e.g. Acme Holdings (Pvt) Ltd"
                  />
                </label>
                <p style={{ fontSize: 12, color: '#c94141', margin: 0 }}>
                  This cannot be undone in-place. You will land on the new company ERP.
                </p>
                <div className="cashbook-pay-tiles">
                  <button
                    type="button"
                    className="cashbook-save"
                    disabled={pending}
                    onClick={() =>
                      run('incorporate', () =>
                        incorporateSoleToCompany({
                          companyName: companyName.trim() || undefined,
                        }),
                      )
                    }
                  >
                    {pending ? <Loader2 className="spin" size={16} /> : null}
                    Create company &amp; archive sole
                  </button>
                  <button type="button" className="cashbook-si-toggle" onClick={() => setConfirm(null)}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button type="button" className="cashbook-si-toggle" onClick={() => setConfirm('incorporate')}>
                Incorporate to company…
              </button>
            )}
          </div>
        ) : null}

        {error ? <p className="cashbook-error">{error}</p> : null}
        {info ? <p className="onboard-lead" style={{ color: '#15835f', margin: 0 }}>{info}</p> : null}
      </div>

      <form action={signOutCurrentUser} style={{ marginTop: 12 }}>
        <button type="submit" className="cashbook-tile action out" style={{ width: '100%' }}>
          Log out{si ? ' (ඉවත් වන්න)' : ''}
        </button>
      </form>
    </CashbookShell>
  );
}
