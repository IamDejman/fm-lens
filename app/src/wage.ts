// An estimate of how FM shows a weekly wage, also used for explicit arrow-key steps. FM rounds a wage to a step that
// grows with the amount (£300,000 and £310,000 both show as £300K), so a wage written as typed may look unchanged in
// FM. Read from FM27's cash formatter (macOS arm64 build 26340721, game_plugin 0x42ca868 and 0x42c9e10).

import { inCurrency } from "./currency";

/** The steps FM rounds a wage to, by the largest amount each applies to, in units of the currency (see `unit`). */
const STEPS: readonly (readonly [upTo: number, step: number])[] = [
  [10, 1],
  [100, 5],
  [500, 10],
  [1_000, 25],
  [5_000, 100],
  [20_000, 250],
  [50_000, 500],
  [100_000, 1_000],
  [250_000, 5_000],
  [1_000_000, 25_000],
  [5_000_000, 100_000],
  [20_000_000, 250_000],
  [50_000_000, 500_000],
];
const LAST_STEP = 1_000_000;

/**
 * FM scales its steps by the power of ten that comes nearest to what a pound is worth in the currency, counting up
 * from 1 while the next power is nearer than 1 is: 1 for pounds, euros and dollars, 100 for lira.
 */
const unit: number = (() => {
  const rate = inCurrency(1);
  const off = Math.abs(rate - 1);
  let found = 1;
  for (let next = 10; Math.abs(rate - next) < off; next *= 10) {
    found = next;
  }
  return found;
})();

function stepOf(amount: number): number {
  const found = STEPS.find(([upTo]) => amount <= upTo * unit);
  return (found ? found[1] : LAST_STEP) * unit;
}

/** The wage FM shows for `amount`, as shown in the chosen currency: rounded to its step, halves up. */
export function fmShownWage(amount: number): number {
  if (amount <= 0) {
    return amount;
  }
  const step = stepOf(amount);
  return Math.floor((amount + Math.floor(step / 2)) / step) * step;
}

/**
 * The next wage above `amount` (or below it, when `up` is false) that FM shows as it is, as the arrow keys step a wage:
 * £300,000 goes up to £325,000 and down to £275,000; £185,198 goes up to £190,000 and down to £185,000.
 */
export function nextFmWage(amount: number, up: boolean): number {
  const shown = fmShownWage(amount);
  if (up) {
    return shown > amount ? shown : shown + stepOf(shown + 1);
  }
  return shown < amount ? shown : shown - stepOf(shown);
}
