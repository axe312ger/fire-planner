import { describe, expect, it } from 'vitest';
import { parseScalableCsvString, parseEuropeanNumber, groupByIsin, monthlyInvestmentRate } from '../src/parsers/scalable-csv.js';

const SAMPLE_CSV = `date;time;status;reference;description;assetType;type;isin;shares;price;amount;fee;tax;currency
2026-02-10;09:15:00;executed;REF001;iShares Core MSCI World;ETF;Savings plan;IE00B4L5Y983;0,929195;53,81;-49,99998295;0;0;EUR
2026-02-10;09:15:00;executed;REF002;Vanguard FTSE All-World;ETF;Savings plan;IE00BK5BQT80;0,452100;110,60;-49,99926600;0;0;EUR
2026-01-10;09:15:00;executed;REF003;iShares Core MSCI World;ETF;Savings plan;IE00B4L5Y983;0,950000;52,63;-49,99850000;0;0;EUR
2025-12-10;09:15:00;executed;REF005;iShares Core MSCI World;ETF;Savings plan;IE00B4L5Y983;0,980000;51,02;-49,99960000;0;0;EUR
2026-01-15;10:00:00;executed;REF006;Tesla Inc;EQUITY;Savings plan;US88160R1014;0,125000;400,00;-50,00000000;0;0;EUR
2025-12-20;14:00:00;executed;REF007;Vanguard FTSE All-World;ETF;Distribution;IE00BK5BQT80;0;0;3,25;0;0,85;EUR
2026-01-05;00:00:00;executed;REF008;;CASH;Interest;;;0;0;1,50;0;0,39;EUR
2026-02-01;00:00:00;executed;REF009;;FEE;Fee;;;0;0;-2,99;0;0;EUR`;

describe('parseEuropeanNumber', () => {
  it('parses comma decimal format', () => {
    expect(parseEuropeanNumber('0,929195')).toBeCloseTo(0.929195, 5);
  });

  it('parses negative amounts', () => {
    expect(parseEuropeanNumber('-49,99998295')).toBeCloseTo(-49.99998295, 5);
  });

  it('parses thousands separator', () => {
    expect(parseEuropeanNumber('1.234,56')).toBeCloseTo(1234.56, 2);
  });

  it('returns 0 for empty string', () => {
    expect(parseEuropeanNumber('')).toBe(0);
  });

  it('returns 0 for undefined', () => {
    expect(parseEuropeanNumber(undefined)).toBe(0);
  });
});

describe('parseScalableCsvString', () => {
  it('parses sample CSV correctly', () => {
    const txs = parseScalableCsvString(SAMPLE_CSV);
    // Only rows with non-empty ISIN (Interest and Fee rows have empty ISIN)
    expect(txs.length).toBe(6);
  });

  it('correctly identifies savings plan transactions', () => {
    const txs = parseScalableCsvString(SAMPLE_CSV);
    const savingsPlans = txs.filter((t) => t.type === 'Savings plan');
    expect(savingsPlans.length).toBe(5);
  });

  it('correctly identifies distribution transactions', () => {
    const txs = parseScalableCsvString(SAMPLE_CSV);
    const distributions = txs.filter((t) => t.type === 'Distribution');
    expect(distributions.length).toBe(1);
    expect(distributions[0].amount).toBeCloseTo(3.25, 2);
    expect(distributions[0].tax).toBeCloseTo(0.85, 2);
  });

  it('parses shares correctly', () => {
    const txs = parseScalableCsvString(SAMPLE_CSV);
    const first = txs[0];
    expect(first.shares).toBeCloseTo(0.929195, 5);
  });

  it('parses amounts as negative for purchases', () => {
    const txs = parseScalableCsvString(SAMPLE_CSV);
    const purchase = txs.find((t) => t.type === 'Savings plan');
    expect(purchase!.amount).toBeLessThan(0);
  });
});

describe('groupByIsin', () => {
  it('groups transactions by ISIN', () => {
    const txs = parseScalableCsvString(SAMPLE_CSV);
    const groups = groupByIsin(txs);

    expect(groups.size).toBe(3); // IE00B4L5Y983, IE00BK5BQT80, US88160R1014
    expect(groups.get('IE00B4L5Y983')?.length).toBe(3); // 3 iShares MSCI World txs
    expect(groups.get('IE00BK5BQT80')?.length).toBe(2); // 1 savings plan + 1 distribution
    expect(groups.get('US88160R1014')?.length).toBe(1); // 1 Tesla
  });
});

describe('monthlyInvestmentRate', () => {
  it('returns most recent savings plan amount as monthly rate', () => {
    const txs = parseScalableCsvString(SAMPLE_CSV);
    const groups = groupByIsin(txs);
    const msciTxs = groups.get('IE00B4L5Y983')!;

    const rate = monthlyInvestmentRate(msciTxs);
    // Most recent savings plan is ~€50
    expect(rate).toBeCloseTo(50, -1);
  });

  it('returns the savings plan amount even with other transaction types', () => {
    const txs = parseScalableCsvString(SAMPLE_CSV);
    const groups = groupByIsin(txs);
    const vanguardTxs = groups.get('IE00BK5BQT80')!;
    // Has 1 savings plan + 1 distribution — should return the savings plan amount
    const rate = monthlyInvestmentRate(vanguardTxs);
    expect(rate).toBeCloseTo(50, -1);
  });
});
