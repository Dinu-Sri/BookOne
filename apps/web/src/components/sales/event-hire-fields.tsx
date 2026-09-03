'use client';

import { todayString } from '@/components/module/list-page';

export function EventHireFields({
  defaults,
}: {
  defaults?: {
    eventDate?: string | null;
    hireFrom?: string | null;
    hireTo?: string | null;
    venue?: string | null;
    guestCount?: number | null;
  };
}) {
  const today = todayString();
  return (
    <>
      <div className="field">
        <label>Event date</label>
        <input className="input" type="date" name="eventDate" defaultValue={defaults?.eventDate ?? today} />
      </div>
      <div className="field">
        <label>Hire from</label>
        <input className="input" type="date" name="hireFrom" defaultValue={defaults?.hireFrom ?? today} />
      </div>
      <div className="field">
        <label>Hire to</label>
        <input className="input" type="date" name="hireTo" defaultValue={defaults?.hireTo ?? today} />
      </div>
      <div className="field">
        <label>Venue</label>
        <input className="input" name="venue" defaultValue={defaults?.venue ?? ''} placeholder="Event location" />
      </div>
      <div className="field">
        <label>Guest count</label>
        <input
          className="input"
          name="guestCount"
          inputMode="numeric"
          defaultValue={defaults?.guestCount != null ? String(defaults.guestCount) : ''}
        />
      </div>
      <div className="field field-full">
        <label className="party-check">
          <input type="checkbox" name="confirmOverlap" value="on" />
          Confirm overlap (warn / manager override)
        </label>
      </div>
      <div className="field field-full">
        <label>Overlap override reason</label>
        <input className="input" name="overlapOverrideReason" placeholder="Required when a manager forces an overlap" />
      </div>
    </>
  );
}
