import { describe, expect, it } from 'vitest';
import { futureValue, requiredMonthly, monthsToTarget } from '../src/calculators/compound.js';

describe('futureValue', () => {
  it('with zero contributions → just compound growth', () => {
    // €10,000 at 7% for 10 years
    const result = futureValue(10_000, 0, 0.07, 120);
    // 10000 * (1 + 0.07/12)^120 ≈ 20,096.61
    expect(result).toBeCloseTo(20_096.61, 0);
  });

  it('with zero starting balance → just contributions', () => {
    // €1,000/mo at 7% for 10 years
    const result = futureValue(0, 1_000, 0.07, 120);
    // PMT * ((1+r)^n - 1) / r ≈ 173,084.81
    expect(result).toBeCloseTo(173_084.81, 0);
  });

  it('with both PV and contributions → combined result', () => {
    // €10,000 + €1,000/mo at 7% for 10 years
    const result = futureValue(10_000, 1_000, 0.07, 120);
    const pvOnly = futureValue(10_000, 0, 0.07, 120);
    const pmtOnly = futureValue(0, 1_000, 0.07, 120);
    expect(result).toBeCloseTo(pvOnly + pmtOnly, 0);
  });

  it('with zero interest rate → linear growth', () => {
    const result = futureValue(10_000, 500, 0, 24);
    expect(result).toBe(10_000 + 500 * 24);
  });

  it('with zero months → returns present value', () => {
    const result = futureValue(10_000, 1_000, 0.07, 0);
    expect(result).toBe(10_000);
  });
});

describe('requiredMonthly', () => {
  it('solves for PMT and round-trips through futureValue', () => {
    const target = 500_000;
    const pv = 10_000;
    const rate = 0.07;
    const months = 120;

    const pmt = requiredMonthly(pv, target, rate, months);
    const fv = futureValue(pv, pmt, rate, months);
    expect(fv).toBeCloseTo(target, 0);
  });

  it('returns 0 when already at target', () => {
    const pmt = requiredMonthly(500_000, 500_000, 0.07, 120);
    expect(pmt).toBe(0);
  });

  it('returns 0 when PV grows past target without contributions', () => {
    // PV that will compound past target
    const pmt = requiredMonthly(400_000, 500_000, 0.07, 120);
    // 400k at 7% for 10 years = ~800k, so no contribution needed
    expect(pmt).toBe(0);
  });

  it('works with zero interest rate', () => {
    const pmt = requiredMonthly(0, 120_000, 0, 120);
    expect(pmt).toBe(1_000);
  });

  it('with zero months → returns gap', () => {
    const pmt = requiredMonthly(100, 1_100, 0.07, 0);
    expect(pmt).toBe(1_000);
  });
});

describe('monthsToTarget', () => {
  it('returns 0 when already at target', () => {
    expect(monthsToTarget(100_000, 1_000, 0.07, 50_000)).toBe(0);
  });

  it('returns correct months for a known scenario', () => {
    // €0 starting, €1000/mo, 0% return → need 100 months for €100k
    const m = monthsToTarget(0, 1_000, 0, 100_000);
    expect(m).toBe(100);
  });

  it('returns null when target unreachable within max months', () => {
    const m = monthsToTarget(0, 1, 0, 1_000_000, 120);
    expect(m).toBeNull();
  });
});
