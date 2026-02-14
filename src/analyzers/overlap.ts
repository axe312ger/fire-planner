import type { OverlapWarning, Position } from '../types.js';

/**
 * Detect overlap between ETFs based on their top holdings.
 * Two ETFs are considered overlapping if they share more than 50% of their top holdings.
 */
export function detectOverlaps(positions: Position[]): OverlapWarning[] {
  const etfs = positions.filter(
    (p) =>
      p.metadata?.topHoldings &&
      p.metadata.topHoldings.length > 0 &&
      (p.category === 'global-etf' || p.category === 'regional-etf' || p.category === 'sector-etf'),
  );

  const warnings: OverlapWarning[] = [];

  for (let i = 0; i < etfs.length; i++) {
    for (let j = i + 1; j < etfs.length; j++) {
      const a = etfs[i];
      const b = etfs[j];

      const holdingsA = new Set(
        (a.metadata!.topHoldings ?? []).map((h) => normalizeName(h.name)),
      );
      const holdingsB = new Set(
        (b.metadata!.topHoldings ?? []).map((h) => normalizeName(h.name)),
      );

      const shared: string[] = [];
      for (const name of holdingsA) {
        if (holdingsB.has(name)) {
          shared.push(name);
        }
      }

      const minSize = Math.min(holdingsA.size, holdingsB.size);
      const overlapPct = minSize > 0 ? (shared.length / minSize) * 100 : 0;

      if (overlapPct > 50) {
        warnings.push({
          isin1: a.isin,
          name1: a.name,
          isin2: b.isin,
          name2: b.name,
          sharedHoldings: shared,
          overlapPercent: overlapPct,
        });
      }
    }
  }

  return warnings;
}

/**
 * Normalize holding names for comparison.
 */
function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(inc|incorporated|corp|corporation|ltd|limited|plc|co|company|sa|ag|nv|se|class [a-z])\b\.?/g, '')
    .replace(/[^a-z0-9]/g, '')
    .trim();
}
