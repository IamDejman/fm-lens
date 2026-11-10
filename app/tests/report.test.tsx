import { expect, test } from 'vitest';
import { describeChecks } from '../src/report';
import type { CheckResult } from '../src/types';

const connected = (results: CheckResult[]) => ({ health: { results } });

test('a report lists the checks that did not pass, with their counts and notes', () => {
  const results: CheckResult[] = [
    { check: 'gameDate', passed: true, fit: 300, sampled: 300, note: '' },
    { check: 'players', passed: false, fit: 1840, sampled: 2000, note: '1960 of 1990 within their potential, 40 of them at it' },
    { check: 'staff', passed: false, fit: 1990, sampled: 2000, note: '' },
  ];
  expect(describeChecks(connected(results))).toBe(
    'players: 1840 of 2000 fit; 1960 of 1990 within their potential, 40 of them at it\nstaff: 1990 of 2000 fit',
  );
});

test('nothing is listed when every check passed or FM Lens is not connected', () => {
  expect(describeChecks(connected([{ check: 'players', passed: true, fit: 2000, sampled: 2000, note: '' }]))).toBe('');
  expect(describeChecks(null)).toBe('');
});
