import { parse } from 'csv-parse/sync';
import { readFileSync } from 'node:fs';
import type { CsvTransaction } from '../types.js';

/**
 * Parse a Scalable Capital CSV export file.
 *
 * Format: semicolon-delimited, European number format (comma = decimal),
 * headers: date;time;status;reference;description;assetType;type;isin;shares;price;amount;fee;tax;currency
 */
export function parseScalableCsv(filePath: string): CsvTransaction[] {
  const raw = readFileSync(filePath, 'utf-8');
  return parseScalableCsvString(raw);
}

export function parseScalableCsvString(raw: string): CsvTransaction[] {
  const records = parse(raw, {
    delimiter: ';',
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
    trim: true,
  }) as Record<string, string>[];

  return records
    .filter((r) => r.isin && r.isin.trim().length > 0)
    .map((r) => ({
      date: r.date ?? '',
      time: r.time ?? '',
      status: r.status ?? '',
      reference: r.reference ?? '',
      description: r.description ?? '',
      assetType: r.assetType ?? '',
      type: r.type ?? '',
      isin: r.isin.trim(),
      shares: parseEuropeanNumber(r.shares),
      price: parseEuropeanNumber(r.price),
      amount: parseEuropeanNumber(r.amount),
      fee: parseEuropeanNumber(r.fee),
      tax: parseEuropeanNumber(r.tax),
      currency: r.currency ?? 'EUR',
    }));
}

/**
 * Parse European number format: "1.234,56" → 1234.56
 */
export function parseEuropeanNumber(value: string | undefined): number {
  if (!value || value.trim() === '') return 0;
  // Remove thousands separator (.) and replace decimal comma with dot
  const cleaned = value.trim().replace(/\./g, '').replace(',', '.');
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

/**
 * Group transactions by ISIN.
 */
export function groupByIsin(transactions: CsvTransaction[]): Map<string, CsvTransaction[]> {
  const map = new Map<string, CsvTransaction[]>();
  for (const tx of transactions) {
    const existing = map.get(tx.isin);
    if (existing) {
      existing.push(tx);
    } else {
      map.set(tx.isin, [tx]);
    }
  }
  return map;
}

/**
 * Calculate the approximate monthly investment rate for a set of transactions.
 * Looks at savings plan transactions, calculates monthly average.
 */
export function monthlyInvestmentRate(transactions: CsvTransaction[]): number {
  const savingsPlans = transactions.filter((t) => t.type === 'Savings plan');
  if (savingsPlans.length === 0) return 0;

  const dates = savingsPlans
    .map((t) => new Date(t.date))
    .filter((d) => !isNaN(d.getTime()))
    .sort((a, b) => a.getTime() - b.getTime());

  if (dates.length < 2) {
    // Only one transaction — return its absolute amount as monthly
    return Math.abs(savingsPlans[0].amount);
  }

  const firstDate = dates[0];
  const lastDate = dates[dates.length - 1];
  const monthSpan =
    (lastDate.getFullYear() - firstDate.getFullYear()) * 12 +
    (lastDate.getMonth() - firstDate.getMonth()) +
    1; // inclusive

  const totalInvested = savingsPlans.reduce((sum, t) => sum + Math.abs(t.amount), 0);
  return totalInvested / Math.max(1, monthSpan);
}
