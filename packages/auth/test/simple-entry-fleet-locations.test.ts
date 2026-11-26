import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { operationalLocations } from '../../../apps/web/src/lib/rental-locations';

// Migration 022 gives every tenant the rental fleet bays ONRENT / REPAIR /
// WASH. Simple Entry listed them and made Location required, so a company
// with no real locations could only post to "On rent" (staging, 2026-11-26).
describe('Simple Entry location picker', () => {
  it('drops rental fleet bays', () => {
    const rows = [
      { id: 'a', locationType: 'on_rent' },
      { id: 'b', locationType: 'repair' },
      { id: 'c', locationType: 'wash' },
      { id: 'd', locationType: 'branch' },
      { id: 'e', locationType: null },
    ];
    expect(operationalLocations(rows).map((r) => r.id)).toEqual(['d', 'e']);
    expect(operationalLocations(rows.slice(0, 3))).toEqual([]);
  });

  it('builds its list through operationalLocations', () => {
    const src = readFileSync(
      path.resolve(__dirname, '../../../apps/web/src/components/simple-entry/simple-entry-screen.tsx'),
      'utf8',
    );
    expect(src).toMatch(/operationalLocations\(data\.locations\)/);
    expect(src).not.toMatch(/setLocationList\(data\.locations\.map/);
  });
});
