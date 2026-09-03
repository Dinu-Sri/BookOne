/**
 * Date-window overlap for hire bookings.
 * BookOne stores hire from/to as YYYY-MM-DD inclusive.
 */

export function datesOverlap(
  aFrom: string,
  aTo: string,
  bFrom: string,
  bTo: string,
): boolean {
  return aFrom <= bTo && aTo >= bFrom;
}

/** Extend the end date by ceil(hours/24) calendar days (wash / transit padding). */
export function padHireTo(hireTo: string, turnaroundHours: number): string {
  const hours = Math.max(0, turnaroundHours || 0);
  const extraDays = Math.ceil(hours / 24);
  if (extraDays <= 0) return hireTo;
  const d = new Date(`${hireTo}T12:00:00`);
  d.setDate(d.getDate() + extraDays);
  return d.toISOString().slice(0, 10);
}

export function availableQty(input: {
  ownedQty: number;
  repairQty: number;
  committedQty: number;
}): number {
  return Math.round((input.ownedQty - input.repairQty - input.committedQty) * 10000) / 10000;
}
