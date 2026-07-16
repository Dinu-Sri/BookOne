'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import {
  Building2,
  CreditCard,
  FileText,
  Mail,
  MapPin,
  Phone,
  UserRound,
  X,
} from 'lucide-react';
import type { PartyRow } from '@/app/actions/parties';
import { formatLKR, StatusBadge } from '@/components/module/list-page';
import { Button } from '@/components/ui/bookone-ui';

function line(value: string | null | undefined, fallback = '—') {
  const t = value?.trim();
  return t ? t : fallback;
}

export function PartySnapshotDialog({
  party,
  role,
  editHref,
  onClose,
}: {
  party: PartyRow;
  role: 'customer' | 'vendor';
  editHref: string;
  onClose: () => void;
}) {
  const title = party.displayName || party.name;
  const balance = role === 'customer' ? party.openReceivable : party.openPayable;
  const balanceLabel = role === 'customer' ? 'Open AR' : 'Open AP';
  const roles =
    party.isCustomer && party.isVendor
      ? 'Customer + Vendor'
      : party.isCustomer
        ? 'Customer'
        : 'Vendor';

  const address = [party.addressLine1 || party.address, party.addressLine2, party.city, party.district, party.province, party.postalCode]
    .filter(Boolean)
    .join(', ');

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal-panel party-snapshot"
        role="dialog"
        aria-modal="true"
        aria-labelledby="party-snapshot-title"
        onClick={(e) => e.stopPropagation()}
      >
        <button className="party-snapshot-close" type="button" onClick={onClose} aria-label="Close">
          <X size={16} />
        </button>

        <div className="party-snapshot-hero">
          <div className="party-snapshot-avatar" aria-hidden>
            {(title || '?').slice(0, 1).toUpperCase()}
          </div>
          <div className="party-snapshot-hero-text">
            <p className="party-snapshot-kicker">{roles}</p>
            <h2 id="party-snapshot-title">{title}</h2>
            <div className="party-snapshot-meta">
              {party.code ? <span className="party-snapshot-chip">{party.code}</span> : null}
              <StatusBadge status={party.status} />
              <StatusBadge status={party.taxStatus} />
            </div>
          </div>
        </div>

        <div className="party-snapshot-metrics">
          <div>
            <span>{balanceLabel}</span>
            <strong style={balance > 0 ? { color: 'var(--danger)' } : undefined}>{formatLKR(balance)}</strong>
          </div>
          <div>
            <span>Documents</span>
            <strong>{party.documentCount}</strong>
          </div>
          <div>
            <span>{role === 'customer' ? 'Credit limit' : 'Terms'}</span>
            <strong>
              {role === 'customer'
                ? party.creditLimit != null
                  ? formatLKR(party.creditLimit)
                  : '—'
                : party.paymentTermsDays != null
                  ? `${party.paymentTermsDays}d`
                  : '—'}
            </strong>
          </div>
        </div>

        <div className="party-snapshot-grid">
          <SnapshotItem icon={<UserRound size={14} />} label="Legal name" value={line(party.legalName || party.name)} />
          <SnapshotItem icon={<Building2 size={14} />} label="Type" value={line(party.partyType)} />
          <SnapshotItem
            icon={<Phone size={14} />}
            label="Mobile"
            value={line(party.phoneMobile || party.phone)}
          />
          <SnapshotItem icon={<Mail size={14} />} label="Email" value={line(party.email)} />
          <SnapshotItem icon={<FileText size={14} />} label="TIN" value={line(party.tin || party.taxId)} />
          <SnapshotItem icon={<FileText size={14} />} label="VAT" value={line(party.vatNumber)} />
          <SnapshotItem icon={<MapPin size={14} />} label="Address" value={line(address)} wide />
          <SnapshotItem
            icon={<CreditCard size={14} />}
            label="Bank"
            value={
              party.bankName
                ? [party.bankName, party.bankBranch, party.bankAccountNo].filter(Boolean).join(' · ')
                : '—'
            }
            wide
          />
          {party.contactPerson ? (
            <SnapshotItem
              icon={<UserRound size={14} />}
              label="Contact"
              value={[party.contactPerson, party.contactPhone, party.contactEmail].filter(Boolean).join(' · ')}
              wide
            />
          ) : null}
          {party.notes ? <SnapshotItem icon={<FileText size={14} />} label="Notes" value={party.notes} wide /> : null}
        </div>

        <div className="modal-actions party-snapshot-actions">
          <Button variant="secondary" type="button" onClick={onClose}>
            Close
          </Button>
          <Link href={editHref}>
            <Button variant="primary" type="button">
              Edit full profile
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}

function SnapshotItem({
  icon,
  label,
  value,
  wide,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  wide?: boolean;
}) {
  return (
    <div className={`party-snapshot-item ${wide ? 'wide' : ''}`}>
      <div className="party-snapshot-item-label">
        {icon}
        <span>{label}</span>
      </div>
      <p>{value}</p>
    </div>
  );
}
