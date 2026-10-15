'use client';

import { useState, type ChangeEvent } from 'react';

type PartyOption = { id: string; name: string; code: string | null };

/**
 * Primary party select/input plus "Or type new name".
 * Either field is enough; native required applies only when the override is empty (BUG-0046).
 */
export function PartyNameFields({
  label,
  placeholder,
  partyOptions,
  partyName,
  onPartyNameChange,
  overridePlaceholder,
}: {
  label: string;
  placeholder: string;
  partyOptions?: PartyOption[];
  partyName?: string;
  onPartyNameChange?: (name: string) => void;
  overridePlaceholder?: string;
}) {
  const [override, setOverride] = useState('');
  const needPrimary = override.trim().length === 0;
  const hasOptions = Boolean(partyOptions && partyOptions.length > 0);
  const controlled = typeof onPartyNameChange === 'function';

  return (
    <>
      <div className="field field-span-2">
        <label>{label} *</label>
        {hasOptions ? (
          <select
            className="input"
            name="partyName"
            required={needPrimary}
            {...(controlled
              ? {
                  value: partyName ?? '',
                  onChange: (e: ChangeEvent<HTMLSelectElement>) => onPartyNameChange!(e.target.value),
                }
              : { defaultValue: partyOptions![0]?.name ?? '' })}
          >
            {controlled && partyName && !partyOptions!.some((p) => p.name === partyName) ? (
              <option value={partyName}>{partyName}</option>
            ) : null}
            {partyOptions!.map((p) => (
              <option key={p.id} value={p.name}>
                {p.code ? `${p.code} — ` : ''}
                {p.name}
              </option>
            ))}
          </select>
        ) : (
          <input
            className="input"
            name="partyName"
            placeholder={placeholder}
            required={needPrimary}
            {...(controlled
              ? {
                  value: partyName ?? '',
                  onChange: (e: ChangeEvent<HTMLInputElement>) => onPartyNameChange!(e.target.value),
                }
              : {})}
          />
        )}
      </div>
      <div className="field">
        <label>Or type new name</label>
        <input
          className="input"
          name="partyNameOverride"
          placeholder={overridePlaceholder ?? placeholder}
          value={override}
          onChange={(e) => setOverride(e.target.value)}
        />
      </div>
    </>
  );
}
