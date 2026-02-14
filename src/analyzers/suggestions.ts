import type { PortfolioAnalysis, Suggestion, GapAnalysis } from '../types.js';

/**
 * Generate prioritized, actionable suggestions based on portfolio analysis and FIRE goals.
 */
export function generateSuggestions(
  analysis: PortfolioAnalysis,
  gap?: GapAnalysis,
): Suggestion[] {
  const suggestions: Suggestion[] = [];

  // 1. Monthly shortfall
  if (gap && gap.monthlyShortfall > 0) {
    suggestions.push({
      priority: 'high',
      action: 'increase',
      message: `Increase monthly investment by €${Math.ceil(gap.monthlyShortfall)} to stay on track for FIRE`,
      detail: `Current: €${Math.round(gap.currentMonthly)}/mo → Required: €${Math.round(gap.requiredMonthly)}/mo (at moderate returns)`,
    });
  }

  // 2. Missing asset classes
  const categories = Object.keys(analysis.categoryAllocation);

  if (!categories.includes('bond-etf')) {
    suggestions.push({
      priority: 'medium',
      action: 'add',
      message: 'Consider adding bond ETFs for diversification',
      detail: 'A small allocation (5-15%) to bonds can reduce portfolio volatility, especially as you approach FIRE.',
    });
  }

  // Check if there's no global core
  const globalAlloc = analysis.categoryAllocation['global-etf'];
  if (!globalAlloc || globalAlloc.percent < 40) {
    suggestions.push({
      priority: 'high',
      action: 'increase',
      message: 'Increase global ETF allocation — should be your portfolio core (50-70%)',
      detail: globalAlloc
        ? `Currently ${globalAlloc.percent.toFixed(1)}% of portfolio. Consider a single MSCI World or FTSE All-World ETF.`
        : 'No global ETF detected. A low-cost global ETF (e.g., Vanguard FTSE All-World) should be the foundation.',
    });
  }

  // 3. Too many sector bets
  const sectorAlloc = analysis.categoryAllocation['sector-etf'];
  if (sectorAlloc && sectorAlloc.percent > 20) {
    suggestions.push({
      priority: 'medium',
      action: 'decrease',
      message: `Sector ETFs are ${sectorAlloc.percent.toFixed(1)}% of portfolio — consider reducing to <15%`,
      detail: 'Sector bets increase concentration risk. The sectors are already included in your global ETF.',
    });
  }

  // 4. Individual stocks concentration
  const stockAlloc = analysis.categoryAllocation['individual-stock'];
  if (stockAlloc && stockAlloc.percent > 15) {
    suggestions.push({
      priority: 'medium',
      action: 'decrease',
      message: `Individual stocks are ${stockAlloc.percent.toFixed(1)}% of portfolio — consider capping at 10-15%`,
      detail: 'Individual stocks carry higher unsystematic risk. Favor broad ETFs for FIRE accumulation.',
    });
  }

  // 5. Overlaps
  for (const overlap of analysis.overlaps) {
    suggestions.push({
      priority: 'medium',
      action: 'sell',
      message: `Overlap detected: ${overlap.name1} and ${overlap.name2} share ${overlap.overlapPercent.toFixed(0)}% of top holdings`,
      detail: `Shared: ${overlap.sharedHoldings.slice(0, 5).join(', ')}. Consider consolidating into one.`,
    });
  }

  // 6. Concentration warnings
  for (const warning of analysis.concentrationWarnings) {
    suggestions.push({
      priority: 'low',
      action: 'decrease',
      message: `Concentration: ${warning}`,
      detail: 'High concentration in a single position increases risk.',
    });
  }

  // 7. High TER positions
  for (const pos of analysis.positions) {
    if (pos.metadata?.ter && pos.metadata.ter > 0.005) {
      // TER > 0.50%
      suggestions.push({
        priority: 'low',
        action: 'switch',
        message: `${pos.name} has a high TER of ${(pos.metadata.ter * 100).toFixed(2)}%`,
        detail: 'Look for cheaper alternatives. Core ETFs should ideally have TER < 0.25%.',
      });
    }
  }

  // 8. Too many small positions (savings plan fragmentation)
  const smallPositions = analysis.positions.filter(
    (p) => p.monthlyInvestment > 0 && p.monthlyInvestment < 25,
  );
  if (smallPositions.length > 3) {
    suggestions.push({
      priority: 'low',
      action: 'decrease',
      message: `${smallPositions.length} positions with <€25/mo savings plan — consider consolidating`,
      detail: 'Many tiny savings plans dilute your investment impact. Focus on fewer, larger positions.',
    });
  }

  // 9. Distributing vs accumulating for FIRE accumulation phase
  const distributing = analysis.positions.filter(
    (p) => p.metadata?.distributionType === 'distributing' && p.monthlyInvestment > 0,
  );
  if (distributing.length > 0) {
    suggestions.push({
      priority: 'low',
      action: 'switch',
      message: `${distributing.length} distributing ETF(s) detected — consider accumulating versions for tax efficiency`,
      detail: `Distributing: ${distributing.map((p) => p.name).join(', ')}. Accumulating ETFs reinvest dividends automatically, deferring taxes during accumulation phase.`,
    });
  }

  // Sort by priority
  const priorityOrder = { high: 0, medium: 1, low: 2 };
  suggestions.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

  return suggestions;
}
