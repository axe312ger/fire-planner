import type { FireConfig, PropertyConfig, Scenario } from '../types.js';
import { fireNumber, inflationAdjustedFireNumberAtMonth, propertyCashNeeded } from '../calculators/fire.js';
import { monthlyMortgagePayment } from '../calculators/mortgage.js';

function eur(n: number): string {
  return n.toLocaleString('de-DE', { maximumFractionDigits: 0 }) + ' €';
}

function eurDetailed(n: number): string {
  return n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}

function pct(n: number): string {
  return (n * 100).toFixed(1) + '%';
}

export function renderMarkdownSummary(
  config: FireConfig,
  properties: PropertyConfig[],
  scenario: Scenario,
  returnRate: number,
): string {
  const lines: string[] = [];
  const now = new Date().toISOString().slice(0, 10);

  // ─── Header ───
  lines.push('# FIRE Investment Plan');
  lines.push('');
  lines.push(`Generated: ${now} | Return rate: ${(returnRate * 100).toFixed(0)}%`);
  lines.push('');

  // ─── Input Parameters ───
  lines.push('## Input Parameters');
  lines.push('');
  lines.push('| Parameter | Value |');
  lines.push('| --- | --- |');
  lines.push(`| Age | ${config.currentAge} |`);
  lines.push(`| Target Age | ${config.targetAge} |`);
  lines.push(`| Annual Expenses | ${eur(config.annualExpenses)} |`);
  lines.push(`| Withdrawal Rate | ${pct(config.withdrawalRate)} |`);
  lines.push(`| Inflation Rate | ${pct(config.inflationRate)} |`);
  lines.push(`| Current Portfolio | ${eur(config.currentPortfolio)} |`);
  lines.push(`| Current Cash | ${eur(config.currentCash)} |`);
  lines.push(`| Monthly Capacity | ${eur(config.monthlyInvestment)} |`);
  lines.push(`| Monthly Rent | ${eur(config.monthlyRent)} |`);
  if (config.rentStartMonth !== undefined && config.rentStartMonth > 0) {
    lines.push(`| Rent Start Month | ${config.rentStartMonth} |`);
  }
  lines.push(`| Cash Rate | ${pct(config.cashRate ?? 0.025)} |`);
  lines.push(`| Parent Loan Term | ${config.parentLoanYears} years |`);
  lines.push('');

  if (properties.length > 0) {
    lines.push('');
    lines.push('### Properties');
    lines.push('');
    for (const p of properties) {
      lines.push(`**${p.label}**`);
      lines.push('');
      lines.push('| Detail | Value |');
      lines.push('| --- | --- |');
      lines.push(`| Price | ${eur(p.price)} |`);
      lines.push(`| Down Payment | ${p.downPaymentPercent}% (${eur(p.price * p.downPaymentPercent / 100)}) |`);
      lines.push(`| Fees | ${p.feesPercent}% (${eur(p.price * p.feesPercent / 100)}) |`);
      if (p.additionalCosts > 0) {
        lines.push(`| Additional Costs | ${eur(p.additionalCosts)} |`);
      }
      lines.push(`| Cash Needed | ${eur(propertyCashNeeded(p))} |`);
      lines.push(`| Purchase | ${p.purchaseMonth !== undefined ? `month ${p.purchaseMonth}` : `year ${p.purchaseYear}`} |`);
      lines.push(`| Mortgage Rate | ${p.mortgageRate}% |`);
      lines.push(`| Mortgage Term | ${p.mortgageTerm} years |`);
      const loanAmount = p.price * (1 - p.downPaymentPercent / 100);
      const monthly = monthlyMortgagePayment(loanAmount, p.mortgageRate, p.mortgageTerm);
      lines.push(`| Monthly Mortgage | ${eurDetailed(monthly)} |`);
      lines.push('');
    }
  }

  // ─── Budget Split ───
  if (scenario.monthlyCashSaving && scenario.monthlyCashSaving > 0) {
    lines.push('## Budget Split (Pre-Purchase)');
    lines.push('');
    const investing = Math.max(0, config.monthlyInvestment - config.monthlyRent - scenario.monthlyCashSaving);
    lines.push(`- Monthly capacity: **${eur(config.monthlyInvestment)}**`);
    lines.push(`- Rent: **${eur(config.monthlyRent)}**`);
    lines.push(`- Cash saving (property): **${eurDetailed(scenario.monthlyCashSaving)}**`);
    lines.push(`- FIRE investing: **${eurDetailed(investing)}**`);
    lines.push('');
  }

  // ─── Phase Breakdown ───
  const phases = scenario.phases;
  if (phases && phases.length > 0) {
    lines.push('## Phase Breakdown');
    lines.push('');
    lines.push('| Phase | Ages | Rent | Mortgage | Parent Loan | Cash Saving | FIRE Investing |');
    lines.push('| --- | --- | --- | --- | --- | --- | --- |');
    for (const ph of phases) {
      lines.push(
        `| ${ph.label} | ${ph.fromAge}–${ph.toAge} | ${eur(ph.monthlyRent)} | ${eur(ph.monthlyMortgage)} | ${eur(ph.monthlyParentLoan)} | ${eur(ph.monthlyCashSaving)} | ${eur(ph.monthlyInvesting)} |`,
      );
    }
    lines.push('');
  }

  // ─── Property Summary ───
  if (properties.length > 0) {
    const parentLoanTotal = scenario.parentLoanTotal ?? 0;
    lines.push('## Property Summary');
    lines.push('');
    lines.push(`- Total parent loan: **${eur(parentLoanTotal)}**`);
    if (parentLoanTotal > 0) {
      const monthlyRepayment = parentLoanTotal / (config.parentLoanYears * 12);
      lines.push(`- Parent loan repayment: **${eurDetailed(monthlyRepayment)}/mo** over ${config.parentLoanYears} years`);
    }
    lines.push('');
  }

  // ─── Simplified Timeline Table ───
  lines.push('## Timeline');
  lines.push('');
  lines.push('| Year | Age | Phase | Cash | Portfolio | Total | FIRE % |');
  lines.push('| --- | --- | --- | --- | --- | --- | --- |');

  const projections = scenario.monthProjections;
  for (const mp of projections) {
    // Yearly rows only (every 12th month)
    if (mp.month % 12 !== 0) continue;

    const fireTarget = inflationAdjustedFireNumberAtMonth(
      config.annualExpenses,
      config.withdrawalRate,
      config.inflationRate,
      mp.month,
    );
    const progress = mp.endBalance > 0 ? (mp.endBalance / fireTarget) * 100 : 0;

    lines.push(
      `| ${mp.date.slice(0, 4)} | ${mp.age} | ${mp.phase} | ${eur(mp.cashBalance)} | ${eur(mp.portfolioBalance)} | ${eur(mp.endBalance)} | ${progress.toFixed(1)}% |`,
    );
  }
  lines.push('');

  // ─── FIRE Result ───
  lines.push('## FIRE Result');
  lines.push('');

  const baseFire = fireNumber(config.annualExpenses, config.withdrawalRate);
  lines.push(`- FIRE number (today): **${eur(baseFire)}**`);

  const lastMonth = projections[projections.length - 1];
  const finalFire = inflationAdjustedFireNumberAtMonth(
    config.annualExpenses,
    config.withdrawalRate,
    config.inflationRate,
    lastMonth.month,
  );
  const finalPct = (scenario.finalBalance / finalFire) * 100;

  lines.push(`- FIRE target (inflation-adjusted at ${config.targetAge}): **${eur(finalFire)}**`);
  lines.push(`- Final balance: **${eur(scenario.finalBalance)}**`);
  lines.push(`- Progress: **${finalPct.toFixed(1)}%**`);

  if (scenario.fireReachedDate) {
    lines.push(`- FIRE reached: **${scenario.fireReachedDate}** (age ${scenario.fireReachedAge})`);
  } else {
    lines.push(`- FIRE **not reached** by target age ${config.targetAge}`);
  }
  lines.push('');

  return lines.join('\n');
}
