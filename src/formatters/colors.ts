import chalk from 'chalk';

export const theme = {
  heading: chalk.bold.cyan,
  subheading: chalk.bold.white,
  positive: chalk.green,
  negative: chalk.red,
  warning: chalk.yellow,
  muted: chalk.gray,
  accent: chalk.magenta,
  money: (n: number) => (n >= 0 ? chalk.green(formatEur(n)) : chalk.red(formatEur(n))),
  percent: (n: number) => (n >= 0 ? chalk.green(formatPct(n)) : chalk.red(formatPct(n))),
  label: chalk.bold,
};

export function formatEur(amount: number): string {
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatEurDetailed(amount: number): string {
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatPct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

export function formatPctPoints(value: number): string {
  return `${value.toFixed(1)}%`;
}
