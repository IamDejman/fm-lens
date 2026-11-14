import { expect, test } from 'vitest';
import { hideManager, maskText } from '../src/replay';

test('a recording hides who the user is and keeps the rest', () => {
  hideManager('Ada Okafor');
  expect(maskText('Ada Okafor - Arsenal')).toBe('*** - Arsenal');
  expect(maskText('A. Okafor signs Bukayo Saka')).toBe('A. *** signs Bukayo Saka');
  expect(maskText('Adama Traoré')).toBe('Adama Traoré');
  expect(maskText('Saved to /Users/ada/Documents/FM Lens')).toBe('Saved to /Users/***/Documents/FM Lens');
  expect(maskText('C:\\Users\\ada\\Documents')).toBe('C:\\Users\\***\\Documents');
  expect(maskText('Sent to ada@example.com')).toBe('Sent to ***');

  hideManager(null);
  expect(maskText('Ada Okafor - Arsenal')).toBe('Ada Okafor - Arsenal');
});
