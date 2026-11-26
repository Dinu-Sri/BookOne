'use client';

import { useMemo, useState } from 'react';
import { createCommerceClearingAccountFromForm, saveCommercePaymentsFromForm } from '@/app/actions/commerce';
import { Button } from '@/components/ui/bookone-ui';
import { SelectField } from '@/components/ui/select-field';
import { TextField } from '@/components/ui/text-field';

export type CommercePaymentSettingsView = {
  defaultAccountCode: string | null;
  methods: Record<string, string>;
  seenMethods: string[];
};

const UNPAID = 'unpaid';

/**
 * Where paid web orders settle. Works with any gateway, bank transfer, COD or
 * card terminal: each payment method name the store sends maps to an account.
 */
export function CommercePaymentsCard({
  connectionId,
  connectionName,
  canWrite,
  accounts,
  settings,
}: {
  connectionId: string;
  connectionName: string;
  canWrite: boolean;
  accounts: Array<{ code: string; name: string }>;
  settings: CommercePaymentSettingsView;
}) {
  const methodNames = useMemo(
    () => [...new Set([...settings.seenMethods, ...Object.keys(settings.methods)])].sort(),
    [settings],
  );
  const [defaultCode, setDefaultCode] = useState(settings.defaultAccountCode ?? '');
  const [methodCodes, setMethodCodes] = useState<Record<string, string>>(() => ({ ...settings.methods }));
  const [newName, setNewName] = useState('');
  const [newCode, setNewCode] = useState('');

  const accountOptions = accounts.map((a) => ({ value: a.code, label: `${a.code} · ${a.name}` }));
  const label = (code: string) => accounts.find((a) => a.code === code)?.name ?? code;
  const defaultLabel = defaultCode ? `${defaultCode} · ${label(defaultCode)}` : '';
  const methodOptions = [
    { value: '', label: defaultCode ? `Use the default (${defaultLabel})` : 'Use the default (not set: stays unpaid)' },
    ...accountOptions,
    { value: UNPAID, label: 'Leave unpaid in receivables' },
  ];

  const preview = defaultCode
    ? `Paid orders post as settled sales into ${defaultLabel}, unless their payment method has its own account below. Match the gateway payouts against that account in Reconciliation.`
    : 'No default is set. Paid orders whose method is not listed below stay open in Accounts Receivable, and Activity shows "payment account not set".';

  return (
    <section className="commerce-card" aria-labelledby={`payments-${connectionId}`}>
      <h2 className="commerce-section-title" id={`payments-${connectionId}`}>
        Payments
      </h2>
      <p className="field-help">
        A paid web order has already been paid, so it should not stay as money the customer owes. Choose the account
        each payment method pays into. Use a clearing account for a payment gateway (money held until it pays out to
        your bank), a bank account for direct transfers, and a cash or courier account for cash on delivery.
      </p>

      <form action={saveCommercePaymentsFromForm} className="commerce-panel-stack">
        <input type="hidden" name="connectionId" value={connectionId} />
        <input type="hidden" name="tab" value="connections" />
        <SelectField
          id={`payments-default-${connectionId}`}
          name="defaultAccountCode"
          label="Default account for paid orders"
          value={defaultCode}
          onChange={setDefaultCode}
          disabled={!canWrite}
          options={[{ value: '', label: 'Not set — leave paid orders unpaid' }, ...accountOptions]}
          emptyReason="Add a bank or clearing account first."
          help="Used when the order's payment method has no account of its own."
        />

        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Payment method sent by the store</th>
                <th>Pays into</th>
              </tr>
            </thead>
            <tbody>
              {methodNames.length === 0 ? (
                <tr>
                  <td colSpan={2} className="field-help">
                    No payment methods received yet. They appear here as orders arrive; you can also add one below.
                  </td>
                </tr>
              ) : (
                methodNames.map((name) => (
                  <tr key={name}>
                    <td>
                      <code>{name}</code>
                      <input type="hidden" name="methodName" value={name} />
                      <input type="hidden" name="methodAccount" value={methodCodes[name] ?? ''} />
                    </td>
                    <td>
                      <SelectField
                        id={`payments-method-${connectionId}-${name}`}
                        label={`Account for ${name}`}
                        value={methodCodes[name] ?? ''}
                        onChange={(v) => setMethodCodes((prev) => ({ ...prev, [name]: v }))}
                        disabled={!canWrite}
                        options={methodOptions}
                      />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {canWrite ? (
          <div className="form-grid">
            <TextField
              id={`payments-new-name-${connectionId}`}
              name="newMethodName"
              label="Add a payment method"
              placeholder="Exact name the store sends, e.g. cod"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              help="Match the payment method ID your store sends with the order."
            />
            <SelectField
              id={`payments-new-account-${connectionId}`}
              name="newMethodAccount"
              label="Pays into"
              value={newCode}
              onChange={setNewCode}
              options={methodOptions}
            />
          </div>
        ) : null}

        <p className="field-help" role="status">
          {preview}
        </p>
        <p className="field-help">Changes apply to new orders only. Orders already posted keep their accounting.</p>
        {canWrite ? <Button type="submit">Save payments</Button> : null}
      </form>

      {canWrite ? (
        <form action={createCommerceClearingAccountFromForm} className="form-grid" style={{ marginTop: 12 }}>
          <input type="hidden" name="connectionId" value={connectionId} />
          <input type="hidden" name="tab" value="connections" />
          <TextField
            id={`payments-gateway-${connectionId}`}
            name="gatewayName"
            label="Create a clearing account"
            placeholder={`Gateway or channel name, e.g. ${connectionName} card payments`}
            help="Creates “<name> clearing” (codes 1201–1299). It becomes the default if none is set. Make one per gateway so each payout reconciles on its own."
            required
          />
          <div style={{ alignSelf: 'start', paddingTop: 22 }}>
            <Button type="submit" variant="secondary">
              Create clearing account
            </Button>
          </div>
        </form>
      ) : null}
    </section>
  );
}
