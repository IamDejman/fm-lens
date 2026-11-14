import { expect, test } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { ClauseList } from '../src/ClauseList';
import { EditorContext, NO_GAME_ACTIONS } from '../src/useProfileEditing';
import type { Clause, CompetitionBonus } from '../src/types';

const appearance: Clause = { index: 0, kind: 32, amount: 68_998, condition: null };

function group(clauses: Clause[], bonuses: CompetitionBonus[]) {
  render(<EditorContext.Provider value={{ editable: true, readOnlyNote: '', onEdited() {}, gameActions: NO_GAME_ACTIONS, injuryKinds: async () => [], gameDate: null, openPlayer() {}, openStaff() {} }}>
    <ClauseList uid={1} name="Declan Rice" clauses={clauses} room={0} bonuses={bonuses} />
  </EditorContext.Provider>);
}

test('competition bonuses are listed under the clauses, by competition, with their amounts', () => {
  group([appearance], [
    { index: 0, key: 637, competition: 'Premier League', amount: 850_975 },
    { index: 1, key: 9_999, competition: null, amount: null },
  ]);
  const terms = screen.getAllByRole('term').map((term) => term.textContent);
  expect(terms).toEqual(['Appearance fee', 'Premier League bonus', 'Unknown competition bonus']);
  const row = screen.getByText('Premier League bonus').closest('div')!;
  expect(within(row).getByRole('definition').textContent).toBe('£850,975');
  // One without an amount still shows that it is there.
  expect(within(screen.getByText('Unknown competition bonus').closest('div')!).getByRole('definition').textContent).toBe('✓');
});

test('a contract with only competition bonuses does not say it has none', () => {
  group([], [{ index: 0, key: 637, competition: 'Premier League', amount: 850_975 }]);
  expect(screen.queryByText('No bonuses or clauses')).toBeNull();
  expect(screen.getByText('Premier League bonus')).toBeTruthy();
});

test('the Change dialog leaves competition bonuses out: they are read, not changed', async () => {
  group([appearance], [{ index: 0, key: 637, competition: 'Premier League', amount: 850_975 }]);
  screen.getByRole('button', { name: 'Change' }).click();
  const dialog = await screen.findByRole('dialog');
  expect(within(dialog).queryByText(/Premier League/)).toBeNull();
  expect(within(dialog).getByText('Appearance fee')).toBeTruthy();
});
