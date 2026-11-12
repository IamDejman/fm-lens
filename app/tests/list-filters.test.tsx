import { beforeEach, expect, test, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PERSONALITY_PREFIX } from '../src/AttributeFilters';
import { ClubBrowser } from '../src/ClubBrowser';
import { toPounds } from '../src/currency';
import { profileText } from '../src/labels';
import { PlayerBrowser } from '../src/PlayerBrowser';
import { countFilters, NO_PLAYER_FILTERS, toPlayerFilter, TRAIT_CHOICES } from '../src/PlayerFilters';
import { readFields } from '../src/savedFilters';
import { readListOrder } from '../src/SortHeader';
import { StadiumBrowser } from '../src/StadiumBrowser';
import { StaffBrowser } from '../src/StaffBrowser';
import { mockInvoke } from '../src/dev/mock';
import type { ClubPage, PlayerPage, StaffPage } from '../src/types';
import { call } from '../src/api';
// A profile stops watching when it closes: the watch gives it something to call.
vi.mock('../src/api', () => ({ inTauri: false, call: vi.fn(), watchCommands: vi.fn(() => () => {}) }));
beforeEach(() => { vi.mocked(call).mockImplementation(mockInvoke); });

/** The arguments of the last request for `command`. */
const lastArgs = (command: string) => vi.mocked(call).mock.calls.filter(([name]) => name === command).at(-1)?.[1];
/** The names in the first column of the table on show, top to bottom. */
const firstColumn = () =>
  screen.getAllByRole('row').slice(1).map((row) => row.querySelector('.name-text, .name')?.textContent?.trim());

test('the player filter asks for ranges, personality and a trait as the search takes them', () => {
  const filter = toPlayerFilter({
    ...NO_PLAYER_FILTERS,
    minCurrentAbility: '120', maxCurrentAbility: '150', maxPotentialAbility: '180',
    minHeight: '185', maxWage: '50000', minValue: '1000000', trait: '7',
    attributes: [
      { key: 'finishing', min: '15', max: '' },
      { key: `${PERSONALITY_PREFIX}ambition`, min: '', max: '9' },
      { key: '', min: '5', max: '' },
    ],
  });
  expect(filter).toMatchObject({
    minCurrentAbility: 120, maxCurrentAbility: 150, maxPotentialAbility: 180, minHeight: 185,
    // Money is typed in the currency on show and asked for in pounds.
    maxWage: toPounds(50000), minValue: toPounds(1000000),
    attributes: [{ key: 'finishing', min: 15 }],
    personality: [{ key: 'ambition', max: 9 }],
    traits: [7],
  });
  // Both ends of a range are one filter: CA, PA, height, wage, value, the trait and the two bounds.
  expect(countFilters(filter)).toBe(8);
  expect(toPlayerFilter(NO_PLAYER_FILTERS)).toBeUndefined();
  // An amount too large for the game is asked for as the most it keeps, not refused by the command.
  expect(toPlayerFilter({ ...NO_PLAYER_FILTERS, maxValue: '9'.repeat(15) })?.maxValue).toBe(2_147_483_647);
});

test('a saved filter keeps the new fields and drops what is not one', () => {
  const kept = readFields({
    maxCurrentAbility: '150', minHeight: '185', maxWage: '50000', minValue: '1000000', trait: '7',
    attributes: [{ key: `${PERSONALITY_PREFIX}ambition`, min: '15', max: '' }, { key: 'personality.nope', min: '1', max: '' }],
  });
  expect(kept).toMatchObject({ maxCurrentAbility: '150', minHeight: '185', maxWage: '50000', minValue: '1000000', trait: '7' });
  expect(kept.attributes.map((row) => row.key)).toEqual([`${PERSONALITY_PREFIX}ambition`, '']);
  expect(readFields({ trait: '62', maxWage: 'lots' })).toMatchObject({ trait: '', maxWage: '' });
  // Every trait the select offers has a name in this language.
  expect(TRAIT_CHOICES.filter((bit) => profileText.traitName(bit) === profileText.traitName(62))).toEqual([]);
  expect(readListOrder({ by: 'name', ascending: true }, ['name', 'nation'])).toEqual({ by: 'name', ascending: true });
  expect(readListOrder({ by: 'wage', ascending: true }, ['name', 'nation'])).toBeNull();
});

test('the sample players keep to the new bounds', async () => {
  const search = (filter: object) => mockInvoke<PlayerPage>('search_players', { query: '', limit: 200, filter });
  const everyone = await search({});
  const capped = await search({ maxCurrentAbility: 120 });
  expect(capped.total).toBeGreaterThan(0);
  expect(capped.total).toBeLessThan(everyone.total);
  expect(capped.rows.every((row) => row.currentAbility <= 120)).toBe(true);
  const details = (uid: number) => mockInvoke<{ heightCm: number; traits: number[]; personality: Record<string, number> }>('player_details', { uid });
  const tall = await search({ minHeight: 188 });
  expect(tall.total).toBeGreaterThan(0);
  for (const row of tall.rows.slice(0, 5)) {
    expect((await details(row.uid)).heightCm).toBeGreaterThanOrEqual(188);
  }
  const ambitious = await search({ personality: [{ key: 'ambition', min: 15 }], traits: [7] });
  for (const row of ambitious.rows.slice(0, 5)) {
    const found = await details(row.uid);
    expect(found.personality.ambition).toBeGreaterThanOrEqual(15);
    expect(found.traits).toContain(7);
  }
});

test('a club header sorts the list and the nation filters it', async () => {
  render(<ClubBrowser version={0} active reveal={null} />);
  await screen.findAllByRole('row');
  // Highest reputation first until a header is clicked: no order is asked for.
  await waitFor(() => expect(lastArgs('search_clubs')).toMatchObject({ query: '' }));
  expect(lastArgs('search_clubs')?.order).toBeUndefined();
  const reputation = screen.getByRole('columnheader', { name: 'Reputation' });
  expect(reputation.getAttribute('aria-sort')).toBe('descending');

  await userEvent.click(within(screen.getByRole('columnheader', { name: 'Name' })).getByRole('button'));
  await waitFor(() => expect(lastArgs('search_clubs')?.order).toEqual({ by: 'name', ascending: true }));
  await waitFor(() => expect(screen.getByRole('columnheader', { name: 'Name' }).getAttribute('aria-sort')).toBe('ascending'));
  await waitFor(() => {
    const names = firstColumn();
    expect(names.length).toBeGreaterThan(2);
    expect(names).toEqual([...names].sort((a, b) => a!.localeCompare(b!)));
  });
  // The same header again sorts the other way.
  await userEvent.click(within(screen.getByRole('columnheader', { name: 'Name' })).getByRole('button'));
  await waitFor(() => expect(lastArgs('search_clubs')?.order).toEqual({ by: 'name', ascending: false }));

  const everyClub = (await mockInvoke<ClubPage>('search_clubs', { query: '', limit: 200 })).rows;
  const nation = everyClub[0].nation!;
  await userEvent.click(screen.getByRole('button', { name: 'Filters' }));
  await userEvent.type(screen.getByRole('textbox', { name: 'Nation' }), nation);
  await waitFor(() => expect(lastArgs('search_clubs')?.filter).toEqual({ nation }));
  const expected = everyClub.filter((club) => club.nation === nation).length;
  await waitFor(() => expect(screen.getAllByRole('row')).toHaveLength(expected + 1));
  expect(expected).toBeLessThan(everyClub.length);
  expect(screen.getByRole('button', { name: `Remove Nation: ${nation}` })).toBeTruthy();
});

test('the staff list asks for an ability range and a sort by age', async () => {
  render(<StaffBrowser version={0} active reveal={null} />);
  await screen.findAllByRole('row');
  await userEvent.click(screen.getByRole('button', { name: 'Filters' }));
  await userEvent.type(screen.getByRole('spinbutton', { name: 'Maximum current ability' }), '120');
  await waitFor(() => expect(lastArgs('search_staff')?.filter).toMatchObject({ maxCurrentAbility: 120 }));
  expect(screen.getByRole('button', { name: 'Remove CA: ≤ 120' })).toBeTruthy();
  await userEvent.click(within(screen.getByRole('columnheader', { name: 'Age' })).getByRole('button'));
  await waitFor(() => expect(lastArgs('search_staff')?.order).toEqual({ by: 'age', ascending: false }));
  const page = await mockInvoke<StaffPage>('search_staff', { query: '', limit: 200, filter: { maxCurrentAbility: 120 }, order: { by: 'age', ascending: false } });
  expect(page.rows.every((row) => row.currentAbility <= 120)).toBe(true);
  const ages = page.rows.map((row) => row.age).filter((age) => age !== null);
  expect(ages).toEqual([...ages].sort((a, b) => b! - a!));
});

test('a stadium names the club that owns it', async () => {
  render(<StadiumBrowser version={0} active />);
  // A ground the sample men's club shares with its women's club: the men's club owns it.
  await userEvent.click((await screen.findAllByRole('row', { name: /Northbridge Park/ }))[0]);
  const owner = await screen.findByText('Owner');
  const fact = owner.parentElement!;
  expect(fact.textContent).toContain('Northbridge FC');
  expect(within(fact).queryByText('Women')).toBeNull();
});

test("a player's profile has the attributes of both kinds of player", async () => {
  const keeper = (await mockInvoke<PlayerPage>('search_players', { query: '', limit: 1, filter: { position: 'gk' } })).rows[0];
  const striker = (await mockInvoke<PlayerPage>('search_players', { query: '', limit: 1, filter: { position: 'st' } })).rows[0];
  render(<PlayerBrowser version={0} active reveal={null} />);
  for (const [player, own, other, attribute] of [
    [striker, 'Technical', 'Goalkeeping', 'Handling'],
    [keeper, 'Goalkeeping', 'Technical', 'Finishing'],
  ] as const) {
    const search = screen.getByRole('textbox', { name: /Search players/ });
    await userEvent.clear(search);
    await userEvent.type(search, String(player.uid));
    await userEvent.click(await screen.findByRole('row', { name: new RegExp(player.name) }));
    const heading = await screen.findByRole('heading', { name: other });
    expect(screen.getByRole('heading', { name: own })).toBeTruthy();
    // The other kind's group has what the player's own group leaves out, each with its value.
    const group = heading.closest('section')!;
    expect(within(group).getByText(attribute)).toBeTruthy();
    expect(group.querySelectorAll('.rating, li, tr, dd').length).toBeGreaterThan(5);
  }
});
