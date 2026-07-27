'use client';

import { useState } from 'react';
import { CashbookShell } from '@/components/cashbook/cashbook-shell';
import { CashbookExportButton } from '@/components/cashbook/cashbook-export-button';
import { Badge } from '@/components/ui/bookone-ui';
import { SiToggle } from '@/components/ui/si-toggle';
import { gloss, readSiGlossPreference, writeSiGlossPreference } from '@/lib/si-gloss';
import type { BookDomain } from '@/lib/entity-kind';

export type SummaryBlock = {
  moneyIn: number;
  moneyOut: number;
  net: number;
  receivables?: number;
  payables?: number;
};

function fmt(n: number) {
  return n.toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function DomainCard({
  label,
  tone,
  block,
  bookDomain,
  period,
  exportLabel,
  showArAp,
  si,
}: {
  label: string;
  tone: 'info' | 'success';
  block: SummaryBlock;
  bookDomain: BookDomain;
  period: string;
  exportLabel: string;
  showArAp?: boolean;
  si: boolean;
}) {
  return (
    <article className="card cb-sum-card">
      <div className="cb-sum-card-head">
        <span className="cb-sum-card-label">{label}</span>
        <Badge tone={tone}>{tone === 'info' ? (si ? 'පුද්ගලික' : 'Personal') : si ? 'ව්‍යාපාර' : 'Business'}</Badge>
      </div>
      <div className="cb-sum-metrics">
        <div>
          <span>{si ? 'ආදායම' : 'In'}</span>
          <strong className="in">LKR {fmt(block.moneyIn)}</strong>
        </div>
        <div>
          <span>{si ? 'වියදම' : 'Out'}</span>
          <strong className="out">LKR {fmt(block.moneyOut)}</strong>
        </div>
        <div className="cb-sum-net">
          <span>{si ? 'ශුද්ධ' : 'Net'}</span>
          <strong>LKR {fmt(block.net)}</strong>
        </div>
      </div>
      {showArAp && ((block.receivables ?? 0) > 0 || (block.payables ?? 0) > 0) ? (
        <p className="cb-sum-arap">
          AR LKR {fmt(block.receivables ?? 0)} · AP LKR {fmt(block.payables ?? 0)}
        </p>
      ) : null}
      <CashbookExportButton bookDomain={bookDomain} period={period} label={exportLabel} />
    </article>
  );
}

export function CashbookSummaryClient({
  tenantName,
  period,
  year,
  entityKind,
  personalMonth,
  businessMonth,
  yearPersonal,
  yearBusiness,
  combinedNet,
}: {
  tenantName: string;
  period: string;
  year: number;
  entityKind: string;
  personalMonth: SummaryBlock;
  businessMonth: SummaryBlock | null;
  yearPersonal: SummaryBlock;
  yearBusiness: SummaryBlock | null;
  combinedNet: number;
}) {
  const [si, setSi] = useState(() => readSiGlossPreference());
  const sole = entityKind === 'sole_prop';

  return (
    <CashbookShell
      title={`${tenantName} · ${gloss('summary', si)}`}
      active="summary"
      si={si}
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
      <div className="cb-summary-page">
        <header className="cb-summary-head">
          <div>
            <p className="eyebrow">{si ? 'මේ මාසය' : 'This month'}</p>
            <h2 className="cb-summary-title">{period}</h2>
          </div>
        </header>

        <div className={`cb-sum-grid ${businessMonth ? 'two' : 'one'}`}>
          <DomainCard
            label={si ? 'පුද්ගලික' : 'Personal'}
            tone="info"
            block={personalMonth}
            bookDomain="personal"
            period={period}
            exportLabel={si ? 'CSV · පුද්ගලික' : 'Download personal CSV'}
            si={si}
          />
          {businessMonth ? (
            <DomainCard
              label={si ? 'ව්‍යාපාර' : 'Business'}
              tone="success"
              block={businessMonth}
              bookDomain="business"
              period={period}
              exportLabel={si ? 'CSV · ව්‍යාපාර' : 'Download business CSV'}
              showArAp
              si={si}
            />
          ) : null}
        </div>

        <header className="cb-summary-head" style={{ marginTop: 8 }}>
          <div>
            <p className="eyebrow">{si ? 'වසර' : 'Year'}</p>
            <h2 className="cb-summary-title">{year}</h2>
          </div>
        </header>

        {sole ? (
          <>
            <div className="cb-sum-grid two">
              <article className="card cb-sum-card">
                <span className="cb-sum-card-label">{si ? 'පුද්ගලික වසර' : 'Personal year'}</span>
                <div className="cb-sum-metrics">
                  <div>
                    <span>{si ? 'ආදායම' : 'Income'}</span>
                    <strong className="in">LKR {fmt(yearPersonal.moneyIn)}</strong>
                  </div>
                  <div>
                    <span>{si ? 'වියදම' : 'Expenses'}</span>
                    <strong className="out">LKR {fmt(yearPersonal.moneyOut)}</strong>
                  </div>
                  <div className="cb-sum-net">
                    <span>{si ? 'ශුද්ධ' : 'Net'}</span>
                    <strong>LKR {fmt(yearPersonal.net)}</strong>
                  </div>
                </div>
              </article>
              <article className="card cb-sum-card">
                <span className="cb-sum-card-label">{si ? 'ව්‍යාපාර වසර' : 'Business year'}</span>
                <div className="cb-sum-metrics">
                  <div>
                    <span>{si ? 'විකුණුම්' : 'Sales'}</span>
                    <strong className="in">LKR {fmt(yearBusiness?.moneyIn ?? 0)}</strong>
                  </div>
                  <div>
                    <span>{si ? 'පිරිවැය' : 'Costs'}</span>
                    <strong className="out">LKR {fmt(yearBusiness?.moneyOut ?? 0)}</strong>
                  </div>
                  <div className="cb-sum-net">
                    <span>{si ? 'ශුද්ධ' : 'Net'}</span>
                    <strong>LKR {fmt(yearBusiness?.net ?? 0)}</strong>
                  </div>
                </div>
              </article>
            </div>
            <article className="card cb-sum-card cb-sum-combined">
              <span className="cb-sum-card-label">
                {si ? 'ඒකාබද්ධ (තොරතුරු)' : 'Combined overview'}
              </span>
              <strong className="cb-sum-combined-net">LKR {fmt(combinedNet)}</strong>
              <p className="cb-sum-note">
                {si
                  ? 'IIT සැලසුම් සඳහා පමණි — ඉදිරිපත් කළ ප්‍රතිඵලයක් නොවේ. බදු packs (Phase 6) පසුව.'
                  : 'For IIT planning only — not a filed return. Tax packs expand later (Phase 6).'}
              </p>
            </article>
          </>
        ) : (
          <article className="card cb-sum-card">
            <div className="cb-sum-metrics">
              <div>
                <span>{si ? 'ආදායම' : 'Income'}</span>
                <strong className="in">LKR {fmt(yearPersonal.moneyIn)}</strong>
              </div>
              <div>
                <span>{si ? 'වියදම' : 'Expenses'}</span>
                <strong className="out">LKR {fmt(yearPersonal.moneyOut)}</strong>
              </div>
              <div className="cb-sum-net">
                <span>{si ? 'ශුද්ධ' : 'Net'}</span>
                <strong>LKR {fmt(yearPersonal.net)}</strong>
              </div>
            </div>
          </article>
        )}

        <p className="cb-sum-foot">
          {si
            ? 'Tax pack v0 = ගණකාධිකාරී සඳහා CSV. IRD e-filing තවම නැත.'
            : 'Tax pack v0 = CSV for your accountant. Full IRD e-filing is out of scope for now.'}
        </p>
      </div>
    </CashbookShell>
  );
}
