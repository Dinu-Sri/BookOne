/** First candidate not already taken, starting at `start` (voided numbers stay taken). */
export async function firstFreeNumber(
  start: number,
  format: (n: number) => string,
  taken: (candidate: string) => Promise<boolean>,
  maxTries = 500,
): Promise<string> {
  for (let n = Math.max(1, start), i = 0; i < maxTries; n += 1, i += 1) {
    const candidate = format(n);
    if (!(await taken(candidate))) return candidate;
  }
  throw new Error('Could not allocate a free number in this series. Try again.');
}
