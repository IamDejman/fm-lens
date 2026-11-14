import { beforeEach, expect, test, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ClubBrowser } from '../src/ClubBrowser';
import { PlayerBrowser } from '../src/PlayerBrowser';
import { readColumns } from '../src/PlayerColumns';
import { countFilters, NO_PLAYER_FILTERS, toPlayerFilter } from '../src/PlayerFilters';
import { readFields, readOrder } from '../src/savedFilters';
import { mockInvoke } from '../src/dev/mock';
import { call } from '../src/api';
import type { PlayerPage } from '../src/types';

vi.mock('../src/api', () => ({ inTauri: false, call: vi.fn(), watchCommands: vi.fn() }));
beforeEach(() => {
  window.localStorage.clear();
  vi.mocked(call).mockImplementation(mockInvoke);
});

/** The arguments of the last search the list asked for. */
const lastSearch = (command: string) =>
  vi.mocked(call).mock.calls.filter(([name]) => name === command).at(-1)?.[1] as Record<string, unknown> | undefined;

test('the player filter bar asks for several positions and a reputation range', () => {
  const filter = toPlayerFilter({ ...NO_PLAYER_FILTERS, positions: ['dc', 'st'], minReputation: '6000' });
  expect(filter).toMatchObject({ positions: ['dc', 'st'], minReputation: 6000 });
  expect(countFilters(filter)).toBe(2);
  expect(toPlayerFilter(NO_PLAYER_FILTERS)).toBeUndefined();
});

test('stored filters, sorts and columns are read field by field', () => {
  // A filter saved before the list took several positions.
  expect(readFields({ position: 'st', minCurrentAbility: '120' })).toMatchObject({
    positions: ['st'],
    minCurrentAbility: '120',
    minReputation: '',
  });
  expect(readFields({ positions: ['st', 'cf', 'gk'], maxReputation: 'lots' })).toMatchObject({
    positions: ['gk', 'st'],
    maxReputation: '',
  });
  expect(readOrder({ by: 'attribute.finishing', ascending: false })).toEqual({ by: 'attribute.finishing', ascending: false });
  expect(readOrder({ by: 'attribute.tactical', ascending: false })).toBeNull();
  expect(readOrder({ by: 'attribute.personality.ambition', ascending: false })).toBeNull();
  expect(readOrder({ by: 'wage', ascending: true })).toEqual({ by: 'wage', ascending: true });
  expect(readColumns({ columns: ['uid', 'age', 'shoe'], attributes: ['pace', 'tactical', 'finishing'] })).toEqual({
    columns: ['age', 'uid'],
    attributes: ['finishing', 'pace'],
  });
});

test('the sample search answers the new filters, sorts and columns', async () => {
  const search = (args: Record<string, unknown>) => mockInvoke<PlayerPage>('search_players', { query: '', limit: 200, ...args });
  const all = await search({});
  expect(all.rows.every((p) => p.currentReputation > 0 && (p.club === null) === (p.wage === null))).toBe(true);

  const either = await search({ filter: { positions: ['gk', 'st'] } });
  const keepers = await search({ filter: { positions: ['gk'] } });
  const strikers = await search({ filter: { positions: ['st'] } });
  expect(either.total).toBeGreaterThan(Math.max(keepers.total, strikers.total));
  expect(either.rows.every((p) => p.positions.includes('gk') || p.positions.includes('st'))).toBe(true);

  const known = await search({ filter: { minReputation: 5000 } });
  expect(known.total).toBeGreaterThan(0);
  expect(known.total).toBeLessThan(all.total);
  expect(known.rows.every((p) => p.currentReputation >= 5000)).toBe(true);

  const byWage = await search({ order: { by: 'wage', ascending: false } });
  const wages = byWage.rows.map((p) => p.wage);
  const paid = wages.filter((wage) => wage !== null);
  expect(paid).toEqual([...paid].sort((a, b) => b - a));
  // Players without a contract come last either way.
  expect(wages.slice(paid.length).every((wage) => wage === null)).toBe(true);

  const byFinishing = await search({ order: { by: 'attribute.finishing', ascending: false }, attributes: ['finishing'] });
  const finishing = byFinishing.rows.map((p) => p.attributeValues?.finishing ?? 0);
  expect(finishing[0]).toBeGreaterThan(finishing.at(-1)!);
  expect(finishing).toEqual([...finishing].sort((a, b) => b - a));
});

test('the player list shows value and wage, and an attribute column once it is chosen', async () => {
  render(<PlayerBrowser version={1} game={0} active reveal={null} />);
  const table = await screen.findByRole('grid');
  await waitFor(() => expect(within(table).getAllByRole('row').length).toBeGreaterThan(1));
  expect(within(table).getByRole('columnheader', { name: 'Value' })).toBeTruthy();
  await userEvent.click(within(table).getByRole('button', { name: 'Wage' }));
  await waitFor(() => expect(lastSearch('search_players')?.order).toEqual({ by: 'wage', ascending: false }));

  await userEvent.click(screen.getByRole('button', { name: 'More' }));
  await userEvent.click(screen.getByRole('button', { name: 'Columns' }));
  const dialog = screen.getByRole('dialog', { name: 'Columns' });
  // The personality ratings of the filter rows are not attributes a column shows.
  expect(within(dialog).queryByRole('checkbox', { name: 'Ambition' })).toBeNull();
  await userEvent.click(within(dialog).getByRole('checkbox', { name: 'Finishing' }));
  await userEvent.click(within(dialog).getByRole('checkbox', { name: 'Value' }));
  await userEvent.click(within(dialog).getByRole('button', { name: 'Done' }));
  await waitFor(() => expect(lastSearch('search_players')?.attributes).toEqual(['finishing']));
  await waitFor(() => expect(within(table).getByRole('columnheader', { name: 'Fin' })).toBeTruthy());
  expect(within(table).queryByRole('columnheader', { name: 'Value' })).toBeNull();
  // The choice is kept for the next time the app opens.
  expect(JSON.parse(window.localStorage.getItem('fmlens.playerColumns')!).attributes).toEqual(['finishing']);

  await userEvent.click(within(table).getByRole('button', { name: 'Fin' }));
  await waitFor(() => expect(lastSearch('search_players')?.order).toEqual({ by: 'attribute.finishing', ascending: false }));
});

test('a club filter and its sort are saved under a name and brought back', async () => {
  render(<ClubBrowser version={1} game={0} active reveal={null} />);
  const table = await screen.findByRole('grid');
  await userEvent.click(screen.getByRole('button', { name: 'Filters' }));
  await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Clubs to show' }), 'women');
  await userEvent.click(within(table).getByRole('button', { name: 'Founded' }));
  await userEvent.click(screen.getByRole('button', { name: 'Save' }));
  await userEvent.type(screen.getByRole('textbox', { name: 'Name of the saved filter' }), "Old women's clubs{Enter}");
  expect(JSON.parse(window.localStorage.getItem('fmlens.savedFilters.clubs')!)).toEqual([
    {
      name: "Old women's clubs",
      fields: { kind: 'women', minReputation: '', maxReputation: '', foundedFrom: '', foundedTo: '', nation: '' },
      order: { by: 'founded', ascending: true },
    },
  ]);

  await userEvent.click(screen.getByRole('button', { name: /^Remove / }));
  await waitFor(() => expect(lastSearch('search_clubs')?.filter).toBeUndefined());
  await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Saved filters' }), "Old women's clubs");
  await waitFor(() => expect(lastSearch('search_clubs')).toMatchObject({ filter: { women: true }, order: { by: 'founded', ascending: true } }));
});

test('a stadium no club plays at is listed, with no club, and opens', async () => {
  const { StadiumBrowser } = await import('../src/StadiumBrowser');
  render(<StadiumBrowser version={1} active />);
  const table = await screen.findByRole('grid');
  const row = (await within(table).findByText('Old Riverside Ground')).closest('tr')!;
  expect(within(row).getByText('-')).toBeTruthy();
  await userEvent.click(row);
  expect(await screen.findByRole('heading', { name: 'Old Riverside Ground' })).toBeTruthy();
  // A men's or women's filter keeps to the clubs that play there, so it leaves such a stadium out.
  await userEvent.click(screen.getByRole('button', { name: 'Filters' }));
  await userEvent.selectOptions(screen.getAllByRole('combobox')[0], 'men');
  await waitFor(() => expect(within(table).queryByText('Old Riverside Ground')).toBeNull());
});
