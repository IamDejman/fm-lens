// Ticking players in the list: Mass edit and Clone & templates take the ticked ones in place of the whole list.

import { beforeEach, expect, test, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PlayerBrowser } from '../src/PlayerBrowser';
import { EditorContext, NO_GAME_ACTIONS } from '../src/useProfileEditing';
import { mockInvoke } from '../src/dev/mock';
import { call } from '../src/api';
import type { PlayerSummary } from '../src/types';

vi.mock('../src/api', () => ({ inTauri: false, call: vi.fn(), watchCommands: vi.fn() }));
beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  vi.mocked(call).mockImplementation(mockInvoke);
});

const editor = {
  editable: true, readOnlyNote: '', onEdited() {}, gameActions: NO_GAME_ACTIONS, injuryKinds: async () => [],
  gameDate: null, openPlayer() {}, openStaff() {},
};

function Players({ game = 0, editable = true }: { game?: number; editable?: boolean }) {
  return (
    <EditorContext.Provider value={{ ...editor, editable }}>
      <PlayerBrowser version={0} game={game} active reveal={null} />
    </EditorContext.Provider>
  );
}

/** Two players of the sample game that one search does not find together. */
async function twoPlayers(): Promise<[PlayerSummary, PlayerSummary]> {
  const { rows } = await mockInvoke<{ rows: PlayerSummary[] }>('search_players', { query: '', limit: 200 });
  const first = rows[0];
  const second = rows.find((row) => !row.name.includes(first.name) && !first.name.includes(row.name))!;
  return [first, second];
}

/** Searches for the player, as the only text in the search box, and ticks his row. */
async function searchAndTick(player: PlayerSummary) {
  const search = screen.getByRole('textbox', { name: /search/i });
  await userEvent.clear(search);
  await userEvent.type(search, String(player.uid));
  await userEvent.click(await screen.findByRole('checkbox', { name: `Select ${player.name}` }));
}

const ticked = () => screen.queryByText(/^[\d,]+ selected$/)?.textContent ?? null;
const lastCall = (command: string) => vi.mocked(call).mock.calls.filter(([name]) => name === command).at(-1)?.[1];

test('a mass edit changes only the players ticked, though found by different searches', async () => {
  const [first, second] = await twoPlayers();
  render(<Players />);
  await searchAndTick(first);
  // Ticking a row does not open it.
  expect(document.querySelector('.profile')).toBeNull();
  expect(ticked()).toBe('1 selected');
  await searchAndTick(second);
  expect(ticked()).toBe('2 selected');

  await userEvent.click(screen.getByRole('button', { name: 'More' }));
  await userEvent.click(screen.getByRole('button', { name: 'Mass edit' }));
  const dialog = await screen.findByRole('dialog', { name: 'Mass edit players' });
  expect(within(dialog).getByText('Only the 2 players you selected')).toBeTruthy();

  // The list shows only the second player now: the mass edit still takes both.
  const target = first.currentAbility === 150 || second.currentAbility === 150 ? 151 : 150;
  await userEvent.type(await within(dialog).findByRole('spinbutton', { name: 'Value' }), String(target));
  await userEvent.click(within(dialog).getByRole('button', { name: 'Preview' }));
  const changes = await within(dialog).findByRole('region', { name: 'Changes the mass edit would make' });
  expect(lastCall('plan_mass_edit')).toMatchObject({ query: '', filters: {}, selected: [first.uid, second.uid] });
  const names = within(changes).getAllByRole('row').slice(1).map((row) => row.querySelector('.name')?.textContent);
  expect(names.sort()).toEqual([first.name, second.name].sort());

  await userEvent.click(within(dialog).getByRole('button', { name: 'Apply' }));
  await within(dialog).findByText('2 changes applied');
  await userEvent.click(within(dialog).getByRole('button', { name: 'Undo this mass edit' }));
  await within(dialog).findByText('Undid 2 changes');
});

test('a freeze alone holds only the players ticked', async () => {
  const [first, second] = await twoPlayers();
  const before = await mockInvoke<number[]>('frozen_players');
  render(<Players />);
  await searchAndTick(first);
  await searchAndTick(second);

  await userEvent.click(screen.getByRole('button', { name: 'More' }));
  await userEvent.click(screen.getByRole('button', { name: 'Mass edit' }));
  const dialog = await screen.findByRole('dialog', { name: 'Mass edit players' });
  // The box starts from what is frozen among the ticked players, not among everyone.
  const box = await within(dialog).findByRole('checkbox', { name: 'Freeze attributes' });
  expect(lastCall('frozen_selection')).toMatchObject({ query: '', filters: {}, selected: [first.uid, second.uid] });
  await userEvent.click(box);
  expect(within(dialog).getByText('2 to freeze')).toBeTruthy();

  await userEvent.click(within(dialog).getByRole('button', { name: 'Apply' }));
  await within(dialog).findByText('2 frozen');
  expect(lastCall('plan_mass_edit')).toMatchObject({ operations: [], freeze: true, selected: [first.uid, second.uid] });
  const frozen = await mockInvoke<number[]>('frozen_players');
  expect(frozen.filter((uid) => !before.includes(uid)).sort()).toEqual([first.uid, second.uid].sort());

  await userEvent.click(within(dialog).getByRole('button', { name: 'Undo this mass edit' }));
  await within(dialog).findByText('2 unfrozen');
  expect(await mockInvoke<number[]>('frozen_players')).toEqual(before);
});

test('a template goes onto only the players ticked', async () => {
  const [first, second] = await twoPlayers();
  const { rows } = await mockInvoke<{ rows: PlayerSummary[] }>('search_players', { query: '', limit: 200 });
  const source = rows.find((row) => row.uid !== first.uid && row.uid !== second.uid)!;
  render(<Players />);
  await searchAndTick(first);
  await searchAndTick(second);

  await userEvent.click(screen.getByRole('button', { name: 'More' }));
  await userEvent.click(screen.getByRole('button', { name: 'Clone & templates' }));
  const dialog = await screen.findByRole('dialog', { name: 'Clone & templates' });
  expect(within(dialog).getByRole('heading', { name: 'Apply to the 2 players you selected' })).toBeTruthy();
  // The ticked players are the list of who it goes onto: there are no IDs to type.
  expect(within(dialog).queryByRole('textbox', { name: 'Only these player IDs' })).toBeNull();

  await userEvent.type(within(dialog).getByRole('searchbox', { name: 'Find player' }), String(source.uid));
  await userEvent.click(await within(dialog).findByRole('button', { name: new RegExp(`${source.uid}$`) }));
  await userEvent.click(within(dialog).getByRole('button', { name: `Copy ${source.name}` }));
  await within(dialog).findByText(/\d+ fields$/);
  await userEvent.click(within(dialog).getByRole('button', { name: 'Preview' }));
  await within(dialog).findByRole('region', { name: 'Changes to apply' });
  expect(lastCall('plan_player_template')).toMatchObject({ query: '', filters: {}, selected: [first.uid, second.uid] });
  expect(within(dialog).getByText(/^2 players · /)).toBeTruthy();
});

test('the header box ticks the rows on show, Shift+Space the row the keyboard is on, and Clear none', async () => {
  render(<Players />);
  const all = await screen.findByRole<HTMLInputElement>('checkbox', { name: 'Select all on this page' });
  const boxes = () => screen.getAllByRole<HTMLInputElement>('checkbox', { name: /^Select (?!all on this page)/ });
  await waitFor(() => expect(boxes().length).toBeGreaterThan(2));
  const shown = boxes().length;

  await userEvent.click(all);
  expect(ticked()).toBe(`${shown} selected`);
  await userEvent.click(boxes()[1]);
  expect(ticked()).toBe(`${shown - 1} selected`);
  expect(all.checked).toBe(false);
  expect(all.indeterminate).toBe(true);

  await userEvent.click(screen.getByRole('button', { name: 'Clear' }));
  expect(ticked()).toBeNull();
  expect(boxes().some((box) => box.checked)).toBe(false);

  const row = boxes()[2].closest('tr')!;
  row.focus();
  fireEvent.keyDown(row, { key: ' ', shiftKey: true });
  expect(ticked()).toBe('1 selected');
  expect(boxes()[2].checked).toBe(true);
  expect(document.querySelector('.profile')).toBeNull();
});

test('another game starts with no player ticked, and a game that cannot be edited has no boxes', async () => {
  const [first] = await twoPlayers();
  const { rerender } = render(<Players />);
  await searchAndTick(first);
  expect(ticked()).toBe('1 selected');

  // FM loaded another save: the same UID may be someone else there.
  rerender(<Players game={1} />);
  await waitFor(() => expect(ticked()).toBeNull());
  expect(screen.getByRole<HTMLInputElement>('checkbox', { name: `Select ${first.name}` }).checked).toBe(false);

  rerender(<Players game={1} editable={false} />);
  expect(screen.queryByRole('checkbox', { name: `Select ${first.name}` })).toBeNull();
  expect(screen.queryByRole('checkbox', { name: 'Select all on this page' })).toBeNull();
});
