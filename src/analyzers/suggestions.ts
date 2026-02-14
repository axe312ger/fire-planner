import type { PortfolioAnalysis, Position, Suggestion, GapAnalysis } from '../types.js';

/**
 * Generate prioritized, actionable suggestions based on portfolio analysis and FIRE goals.
 * Includes per-position analysis with specific actions.
 */
export function generateSuggestions(
  analysis: PortfolioAnalysis,
  gap?: GapAnalysis,
): Suggestion[] {
  const suggestions: Suggestion[] = [];

  // ─── Portfolio-Level Suggestions ───

  // 1. Monthly shortfall
  if (gap && gap.monthlyShortfall > 0) {
    suggestions.push({
      priority: 'high',
      action: 'increase',
      message: `Increase monthly investment by €${Math.ceil(gap.monthlyShortfall)} to stay on track for FIRE`,
      detail: `Current: €${Math.round(gap.currentMonthly)}/mo → Required: €${Math.round(gap.requiredMonthly)}/mo (at moderate returns)`,
    });
  }

  // 2. Global ETF core too small
  const globalAlloc = analysis.categoryAllocation['global-etf'];
  if (!globalAlloc || globalAlloc.percent < 40) {
    suggestions.push({
      priority: 'high',
      action: 'increase',
      message: 'Increase global ETF allocation — should be your portfolio core (50-70%)',
      detail: globalAlloc
        ? `Currently ${globalAlloc.percent.toFixed(1)}% of portfolio. Funnel most of your savings plan budget into 1-2 global ETFs.`
        : 'No global ETF detected. A low-cost global ETF (e.g., Xtrackers MSCI World at 0.12% TER) should be the foundation.',
    });
  }

  // 3. Missing bonds
  if (!analysis.categoryAllocation['bond-etf']) {
    suggestions.push({
      priority: 'medium',
      action: 'add',
      message: 'Consider adding bond ETFs for diversification (5-15% of portfolio)',
      detail: 'Bonds reduce volatility. Consider iShares Core Global Aggregate Bond (TER 0.10%) as you approach FIRE.',
    });
  }

  // 4. Too many sector bets
  const sectorAlloc = analysis.categoryAllocation['sector-etf'];
  if (sectorAlloc && sectorAlloc.percent > 20) {
    suggestions.push({
      priority: 'high',
      action: 'decrease',
      message: `Sector ETFs are ${sectorAlloc.percent.toFixed(1)}% of portfolio — reduce to <15%`,
      detail: 'Sector bets increase concentration risk. These sectors are already included in your global ETF.',
    });
  }

  // 5. Individual stocks too high
  const stockAlloc = analysis.categoryAllocation['individual-stock'];
  if (stockAlloc && stockAlloc.percent > 15) {
    suggestions.push({
      priority: 'high',
      action: 'decrease',
      message: `Individual stocks are ${stockAlloc.percent.toFixed(1)}% of portfolio — target <10-15%`,
      detail: 'Individual stocks carry higher unsystematic risk. Redirect savings plans to broad ETFs.',
    });
  }

  // 6. Too many small positions
  const smallPositions = analysis.positions.filter(
    (p) => p.monthlyInvestment > 0 && p.monthlyInvestment < 25,
  );
  if (smallPositions.length > 3) {
    suggestions.push({
      priority: 'medium',
      action: 'decrease',
      message: `${smallPositions.length} positions with <€25/mo savings plans — consolidate`,
      detail: `Positions: ${smallPositions.map((p) => p.name.split(' ')[0]).join(', ')}. Cancel these and redirect to your core ETFs.`,
    });
  }

  // 7. Overlaps
  for (const overlap of analysis.overlaps) {
    suggestions.push({
      priority: 'medium',
      action: 'sell',
      message: `Overlap: ${overlap.name1} ↔ ${overlap.name2} share ${overlap.overlapPercent.toFixed(0)}% of top holdings`,
      detail: `Shared: ${overlap.sharedHoldings.slice(0, 5).join(', ')}. Keep the cheaper one, sell the other.`,
    });
  }

  // 8. Distributing ETFs
  const distributing = analysis.positions.filter(
    (p) => p.metadata?.distributionType === 'distributing' && p.monthlyInvestment > 0,
  );
  if (distributing.length > 0) {
    for (const pos of distributing) {
      suggestions.push({
        priority: 'low',
        action: 'switch',
        message: `${pos.name}: Switch to accumulating version for tax efficiency`,
        detail: `Distributing ETFs create taxable events. Find the Acc equivalent and redirect your €${pos.monthlyInvestment.toFixed(0)}/mo savings plan.`,
      });
    }
  }

  // ─── Per-Position Analysis ───

  suggestions.push({
    priority: 'medium',
    action: 'increase',
    message: '── Per-Position Analysis ──',
    detail: 'Individual assessment of each position with recommended action:',
  });

  const totalMonthly = analysis.totalMonthlyInvestment;
  const totalValue = analysis.totalCurrentValue;

  // Sort by current value descending
  const sorted = [...analysis.positions].sort((a, b) => b.currentValue - a.currentValue);

  for (const pos of sorted) {
    const pctOfPortfolio = totalValue > 0 ? (pos.currentValue / totalValue) * 100 : 0;
    const pctOfMonthly = totalMonthly > 0 ? (pos.monthlyInvestment / totalMonthly) * 100 : 0;
    const pl = pos.currentValue - pos.totalInvested;
    const plPct = pos.totalInvested > 0 ? (pl / pos.totalInvested) * 100 : 0;
    const isEtf = ['global-etf', 'regional-etf', 'sector-etf', 'bond-etf'].includes(pos.category);

    const assessment = assessPosition(pos, pctOfPortfolio, pctOfMonthly, pl, plPct, isEtf, totalMonthly);

    suggestions.push({
      priority: assessment.priority,
      action: assessment.action,
      message: `${pos.name} (${pos.isin})`,
      detail: assessment.detail,
    });
  }

  return suggestions;
}

interface Assessment {
  priority: 'high' | 'medium' | 'low';
  action: 'increase' | 'decrease' | 'sell' | 'add' | 'switch';
  detail: string;
}

function assessPosition(
  pos: Position,
  pctOfPortfolio: number,
  pctOfMonthly: number,
  pl: number,
  plPct: number,
  isEtf: boolean,
  totalMonthly: number,
): Assessment {
  const lines: string[] = [];
  const plStr = pl >= 0 ? `+€${Math.round(pl)} (+${plPct.toFixed(1)}%)` : `-€${Math.abs(Math.round(pl))} (${plPct.toFixed(1)}%)`;

  lines.push(`${pctOfPortfolio.toFixed(1)}% of portfolio | ${pctOfMonthly.toFixed(0)}% of monthly | P/L: ${plStr} | €${pos.monthlyInvestment.toFixed(0)}/mo`);

  // ─── Global ETFs: the core ───
  if (pos.category === 'global-etf') {
    if (pos.metadata?.ter && pos.metadata.ter <= 0.002) {
      lines.push(`KEEP & INCREASE: Core holding. Low TER (${(pos.metadata.ter * 100).toFixed(2)}%). Increase savings plan to make this 50-70% of portfolio.`);
      return { priority: 'high', action: 'increase', detail: lines.join('\n      ') };
    }
    lines.push(`KEEP & INCREASE: Core holding. Increase savings plan. This should be the bulk of your portfolio.`);
    return { priority: 'high', action: 'increase', detail: lines.join('\n      ') };
  }

  // ─── Sector ETFs ───
  if (pos.category === 'sector-etf') {
    const ter = pos.metadata?.ter ?? 0;

    if (ter > 0.004) {
      lines.push(`STOP SAVINGS PLAN: High TER (${(ter * 100).toFixed(2)}%). This sector is already in your global ETF.`);
      if (pl < 0 && plPct < -15) {
        lines.push(`Hold for now (down ${plPct.toFixed(0)}%), but stop adding money. Consider selling when it recovers.`);
      } else if (pl >= 0) {
        lines.push(`In profit — consider selling and redirecting to global ETF.`);
      } else {
        lines.push(`Down ${plPct.toFixed(0)}% — hold, but stop the savings plan.`);
      }
      return { priority: 'high', action: 'decrease', detail: lines.join('\n      ') };
    }

    if (pctOfPortfolio > 10) {
      lines.push(`REDUCE: ${pctOfPortfolio.toFixed(0)}% is too much for a sector bet. Cap at 5%.`);
      lines.push(`Stop savings plan, let it naturally shrink as your core grows.`);
      return { priority: 'medium', action: 'decrease', detail: lines.join('\n      ') };
    }

    lines.push(`HOLD: Acceptable as a small satellite position (<5% target).`);
    if (pos.monthlyInvestment > 0) {
      lines.push(`Consider stopping the savings plan and redirecting to core ETFs.`);
    }
    return { priority: 'low', action: 'decrease', detail: lines.join('\n      ') };
  }

  // ─── Regional ETFs ───
  if (pos.category === 'regional-etf') {
    if (pctOfPortfolio > 10) {
      lines.push(`REDUCE: ${pctOfPortfolio.toFixed(0)}% is a large regional bet. Consider capping at 5-10%.`);
      return { priority: 'medium', action: 'decrease', detail: lines.join('\n      ') };
    }
    if (pos.metadata?.ter && pos.metadata.ter > 0.004) {
      lines.push(`REVIEW: High TER (${(pos.metadata.ter * 100).toFixed(2)}%). Consider a cheaper alternative or reduce.`);
      return { priority: 'low', action: 'switch', detail: lines.join('\n      ') };
    }
    lines.push(`HOLD: Decent regional diversification. Keep as a small satellite.`);
    return { priority: 'low', action: 'decrease', detail: lines.join('\n      ') };
  }

  // ─── Commodity (Gold) ───
  if (pos.category === 'commodity') {
    if (pctOfPortfolio < 5) {
      lines.push(`INCREASE: Gold at ${pctOfPortfolio.toFixed(1)}% is low. Target 5-10% for portfolio stability.`);
      return { priority: 'medium', action: 'increase', detail: lines.join('\n      ') };
    }
    lines.push(`KEEP: Good hedge position.`);
    return { priority: 'low', action: 'increase', detail: lines.join('\n      ') };
  }

  // ─── Individual Stocks ───
  if (pos.category === 'individual-stock') {
    // High conviction + profit → hold but cap
    if (pl >= 0 && pctOfPortfolio > 5) {
      lines.push(`STOP SAVINGS PLAN & TRIM: In profit (+${plPct.toFixed(0)}%) but ${pctOfPortfolio.toFixed(1)}% is too much for one stock.`);
      lines.push(`Stop the savings plan. Consider selling partial to rebalance.`);
      return { priority: 'high', action: 'decrease', detail: lines.join('\n      ') };
    }

    if (pl >= 0 && pctOfPortfolio <= 5) {
      if (pos.monthlyInvestment < 15) {
        lines.push(`HOLD: Small profitable position. Savings plan is tiny (€${pos.monthlyInvestment.toFixed(0)}/mo) — cancel and redirect.`);
      } else {
        lines.push(`HOLD: In profit. Acceptable size. Keep as a satellite bet.`);
      }
      return { priority: 'low', action: 'decrease', detail: lines.join('\n      ') };
    }

    // Losing position
    if (plPct < -20) {
      lines.push(`STOP SAVINGS PLAN: Down ${plPct.toFixed(0)}%. Stop adding money. Re-evaluate your thesis.`);
      if (pos.totalInvested < 200) {
        lines.push(`Small position — consider selling at a loss for tax-loss harvesting and redirect to ETFs.`);
      } else {
        lines.push(`Larger position — hold for recovery but absolutely stop the savings plan.`);
      }
      return { priority: 'high', action: 'sell', detail: lines.join('\n      ') };
    }

    if (plPct < 0) {
      lines.push(`REVIEW: Down ${Math.abs(plPct).toFixed(0)}%. Consider stopping savings plan if no strong conviction.`);
      lines.push(`Redirect the €${pos.monthlyInvestment.toFixed(0)}/mo to your core global ETF.`);
      return { priority: 'medium', action: 'decrease', detail: lines.join('\n      ') };
    }

    lines.push(`HOLD: Neutral position.`);
    return { priority: 'low', action: 'decrease', detail: lines.join('\n      ') };
  }

  // ─── Anything else ───
  lines.push(`REVIEW: Unclassified position. Check if it still fits your strategy.`);
  return { priority: 'low', action: 'decrease', detail: lines.join('\n      ') };
}
