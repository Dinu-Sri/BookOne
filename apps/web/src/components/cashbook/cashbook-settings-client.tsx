'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Building2,
  ExternalLink,
  Languages,
  Loader2,
  LogOut,
  Sparkles,
  Store,
} from 'lucide-react';
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
import { Badge, Button } from '@/components/ui/bookone-ui';
import type { CapabilityTier, EntityKind } from '@/lib/entity-kind';

type ConfirmKind = 'sole' | 'full' | 'lite' | 'incorporate';

function LifecycleAction({
  icon: Icon,
  title,
  body,
  tone,
  actionLabel,
  confirmLabel,
  danger,
  pending,
  open,
  onOpen,
  onCancel,
  onConfirm,
  extra,
}: {
  icon: typeof Store;
  title: string;
  body: string;
  tone: 'info' | 'warning' | 'danger' | 'success';
  actionLabel: string;
  confirmLabel: string;
  danger?: boolean;
  pending: boolean;
  open: boolean;
  onOpen: () => void;
  onCancel: () => void;
  onConfirm: () => void;
  extra?: React.ReactNode;
}) {
  return (
    <div className={`cb-life-item cb-life-${tone}`}>
      <div className="cb-life-item-top">
        <span className={`cb-life-icon cb-life-icon-${tone}`} aria-hidden>
          <Icon size={18} />
        </span>
        <div className="cb-life-copy">
          <strong>{title}</strong>
          <p>{body}</p>
        </div>
      </div>
      {open ? (
        <div className="cb-life-confirm">
          {extra}
          <p className="cb-life-confirm-q">{confirmLabel}</p>
          <div className="cb-life-actions">
            <Button
              variant={danger ? 'secondary' : 'primary'}
              type="button"
              disabled={pending}
              className={danger ? 'cb-btn-danger' : ''}
              onClick={onConfirm}
            >
              {pending ? <Loader2 className="spin" size={16} /> : null}
              {danger ? 'Yes, continue' : 'Confirm'}
            </Button>
            <Button variant="ghost" type="button" disabled={pending} onClick={onCancel}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="cb-life-actions">
          <Button
            variant={danger ? 'secondary' : 'primary'}
            type="button"
            className={danger ? 'cb-btn-danger-outline' : ''}
            onClick={onOpen}
          >
            {actionLabel}
          </Button>
        </div>
      )}
    </div>
  );
}

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
  const [confirm, setConfirm] = useState<ConfirmKind | null>(null);

  function run(
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

  const tierBadge =
    entityKind === 'personal'
      ? { tone: 'info' as const, label: si ? 'පුද්ගලික' : 'Personal' }
      : entityKind === 'sole_prop'
        ? {
            tone: (capabilityTier === 'full' ? 'success' : 'warning') as 'success' | 'warning',
            label:
              capabilityTier === 'full'
                ? si
                  ? 'තනි හිමිකම · සම්පූර්ණ'
                  : 'Sole · Full'
                : si
                  ? 'තනි හිමිකම · සරල'
                  : 'Sole · Lite',
          }
        : { tone: 'neutral' as const, label: entityKind };

  const hasLifecycle =
    canUpgradeToSole || canUpgradeToFull || canDowngradeToLite || canIncorporate;

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
      <div className="cb-settings">
        {/* Profile */}
        <section className="card cb-settings-card">
          <div className="card-header">
            <div>
              <p className="eyebrow">{si ? 'ගිණුම' : 'Account'}</p>
              <h2 className="card-title">{tenantName}</h2>
              <p className="card-subtitle">
                {si ? 'ඔබගේ වත්මන් වැඩබිමේ වර්ගය' : 'Current workspace type and language'}
              </p>
            </div>
            <Badge tone={tierBadge.tone}>{tierBadge.label}</Badge>
          </div>
          <div className="card-body cb-settings-body">
            <div className="cb-settings-row">
              <div className="cb-settings-row-label">
                <Languages size={18} aria-hidden />
                <div>
                  <strong className={si ? 'si-text' : undefined} lang={si ? 'si' : undefined}>
                    {si ? 'භාෂාව' : 'Language'}
                  </strong>
                  <span>
                    {si
                      ? 'ලේබල සිංහලෙන් පෙන්වයි'
                      : 'Show cashbook labels in Sinhala'}
                  </span>
                </div>
              </div>
              <SiToggle
                on={si}
                onChange={(n) => {
                  setSi(n);
                  writeSiGlossPreference(n);
                }}
              />
            </div>

            {showFullErpLink ? (
              <Link href="/" className="cb-settings-link-row">
                <span className="cb-settings-row-label">
                  <ExternalLink size={18} aria-hidden />
                  <div>
                    <strong>{si ? 'සම්පූර්ණ BookOne' : 'Full BookOne ERP'}</strong>
                    <span>
                      {si
                        ? 'විකුණුම්, තොග, POS සහ තවත්'
                        : 'Sales, stock, POS and company tools'}
                    </span>
                  </div>
                </span>
                <span className="cb-chevron">→</span>
              </Link>
            ) : null}
          </div>
        </section>

        {/* Lifecycle */}
        {hasLifecycle ? (
          <section className="card cb-settings-card">
            <div className="card-header">
              <div>
                <p className="eyebrow">
                  <Sparkles size={12} style={{ display: 'inline', verticalAlign: -1 }} />{' '}
                  {si ? 'වර්ධනය' : 'Grow'}
                </p>
                <h2 className="card-title">
                  {si ? 'වැඩබිම වර්ධනය කරන්න' : 'Grow your workspace'}
                </h2>
                <p className="card-subtitle">
                  {si
                    ? 'ඉතිහාසය සුරැකේ. ජර්නල් මකන්නේ නැත. උසස් කිරීම් / පහත හෙළීම් පැහැදිලිව තහවුරු කරන්න.'
                    : 'History is kept. Journals are never deleted. Confirm each change before it runs.'}
                </p>
              </div>
            </div>
            <div className="card-body cb-settings-body cb-life-stack">
              {canUpgradeToSole ? (
                <LifecycleAction
                  icon={Store}
                  title={si ? 'තනි හිමිකම (සරල)' : 'Upgrade to sole prop (lite)'}
                  body={
                    si
                      ? 'පුද්ගලික සහ ව්‍යාපාර පොත් දෙකම. සරල ඉන්වොයිස් / බිල්.'
                      : 'Add a Business book beside Personal. Lite invoices and bills on business domain.'
                  }
                  tone="info"
                  actionLabel={si ? 'උසස් කරන්න' : 'Upgrade to sole lite'}
                  confirmLabel={
                    si
                      ? 'මෙම පුද්ගලික වැඩබිම sole lite බවට උසස් කරන්නද?'
                      : 'Upgrade this personal workspace to sole prop lite?'
                  }
                  pending={pending}
                  open={confirm === 'sole'}
                  onOpen={() => setConfirm('sole')}
                  onCancel={() => setConfirm(null)}
                  onConfirm={() => run(() => upgradePersonalToSoleLite())}
                />
              ) : null}

              {canUpgradeToFull ? (
                <LifecycleAction
                  icon={ArrowUpRight}
                  title={si ? 'සම්පූර්ණ මොඩියුල' : 'Expand to sole full'}
                  body={
                    si
                      ? 'තොග, POS, සම්පූර්ණ විකුණුම්/මිලදී ගැනීම. මුදල් පොත තවමත් තිබේ.'
                      : 'Turn on stock, POS, and full sales/purchase. Cashbook domain switcher stays.'
                  }
                  tone="success"
                  actionLabel={si ? 'සම්පූර්ණ කරන්න' : 'Enable full modules'}
                  confirmLabel={
                    si
                      ? 'සම්පූර්ණ ව්‍යාපාර මොඩියුල සක්‍රිය කරන්නද?'
                      : 'Enable full business modules on this sole prop?'
                  }
                  pending={pending}
                  open={confirm === 'full'}
                  onOpen={() => setConfirm('full')}
                  onCancel={() => setConfirm(null)}
                  onConfirm={() => run(() => upgradeSoleLiteToFull())}
                />
              ) : null}

              {canDowngradeToLite ? (
                <LifecycleAction
                  icon={ArrowDownLeft}
                  title={si ? 'සරල මාදිලියට' : 'Downgrade to sole lite'}
                  body={
                    si
                      ? 'තොග/POS සංස්කරණය අක්‍රිය. පැරණි දත්ත බලන්න පමණි.'
                      : 'Create/edit for stock & POS turns off. You can still view past history.'
                  }
                  tone="warning"
                  actionLabel={si ? 'පහත හෙළන්න' : 'Downgrade to lite'}
                  confirmLabel={
                    si
                      ? 'සම්පූර්ණ මොඩියුල සඟවා cashbook-ප්‍රධාන සරල මාදිලියට යන්නද?'
                      : 'Return to cashbook-first lite? Advanced modules become view-only.'
                  }
                  danger
                  pending={pending}
                  open={confirm === 'lite'}
                  onOpen={() => setConfirm('lite')}
                  onCancel={() => setConfirm(null)}
                  onConfirm={() => run(() => downgradeSoleFullToLite())}
                />
              ) : null}

              {canIncorporate ? (
                <LifecycleAction
                  icon={Building2}
                  title={si ? 'Pvt Ltd ලෙස ලියාපදිංචි' : 'Incorporate as Pvt Ltd'}
                  body={
                    si
                      ? 'නව සමාගමක්. ව්‍යාපාර ශේෂ ගෙන යයි. මෙම sole ලේඛනාගාරයට.'
                      : 'Creates a new company. Opening balances from business domain. This sole is archived.'
                  }
                  tone="danger"
                  actionLabel={si ? 'සමාගම සාදන්න…' : 'Incorporate to company…'}
                  confirmLabel={
                    si
                      ? 'නව සමාගම සාදා මෙම sole ලේඛනාගාරයට යවන්නද? ආපසු හැරවිය නොහැක.'
                      : 'Create the company and archive this sole? This cannot be undone in-place.'
                  }
                  danger
                  pending={pending}
                  open={confirm === 'incorporate'}
                  onOpen={() => setConfirm('incorporate')}
                  onCancel={() => setConfirm(null)}
                  onConfirm={() =>
                    run(() =>
                      incorporateSoleToCompany({
                        companyName: companyName.trim() || undefined,
                      }),
                    )
                  }
                  extra={
                    <label className="cb-life-field">
                      <span>{si ? 'සමාගමේ නම' : 'Company legal name'}</span>
                      <input
                        className="input"
                        value={companyName}
                        onChange={(e) => setCompanyName(e.target.value)}
                        placeholder="e.g. Acme Holdings (Pvt) Ltd"
                        autoComplete="organization"
                      />
                    </label>
                  }
                />
              ) : null}

              {error ? <p className="cashbook-error">{error}</p> : null}
              {info ? <p className="cb-life-success">{info}</p> : null}
            </div>
          </section>
        ) : null}

        {/* Sign out */}
        <section className="card cb-settings-card cb-settings-danger-zone">
          <div className="card-body cb-settings-body">
            <form action={signOutCurrentUser}>
              <Button variant="secondary" type="submit" className="cb-btn-logout">
                <LogOut size={16} aria-hidden />
                {gloss('log_out', si)}
              </Button>
            </form>
          </div>
        </section>
      </div>
    </CashbookShell>
  );
}
