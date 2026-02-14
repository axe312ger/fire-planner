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
  // Scalable Capital exports may have a leading empty-delimiter row before the real header.
  // Strip lines that consist only of semicolons/whitespace before the actual header.
  // Strip UTF-8 BOM if present
  const noBom = raw.charCodeAt(0) === 0xFEFF ? raw.slice(1) : raw;
  const lines = noBom.split(/\r?\n/);
  const headerIdx = lines.findIndex((l) => l.toLowerCase().startsWith('date;'));
  const cleaned = headerIdx > 0 ? lines.slice(headerIdx).join('\n') : noBom;

  const records = parse(cleaned, {
    delimiter: ';',
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
    trim: true,
  }) as Record<string, string>[];

  return records
    .filter((r) => r.isin && r.isin.trim().length > 0 && (!r.status || r.status.trim().toLowerCase() === 'executed'))
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
 * Determine the current monthly savings plan rate for a position.
 *
 * Uses the most recent savings plan execution amount, since Scalable Capital
 * savings plans execute a fixed amount each month. Historical averaging is
 * unreliable because plans may have been started/stopped/changed over time,
 * and the CSV can span years.
 */
export function monthlyInvestmentRate(transactions: CsvTransaction[]): number {
  const savingsPlans = transactions
    .filter((t) => t.type === 'Savings plan')
    .sort((a, b) => b.date.localeCompare(a.date)); // newest first

  if (savingsPlans.length === 0) return 0;

  // Use the most recent savings plan execution as the current monthly rate
  return Math.abs(savingsPlans[0].amount);
}
