export function backoffDelay(attempt: number): number {
  return Math.min(30_000, 1000 * 2 ** attempt);
}
