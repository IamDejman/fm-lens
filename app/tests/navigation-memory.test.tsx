import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const api = vi.hoisted(() => ({ call: vi.fn() }));
vi.mock('../src/api', () => ({ inTauri: false, call: api.call, watchCommands: vi.fn() }));

const KEPT = 'fmlens.navigation';

beforeEach(() => {
  vi.resetModules();
  sessionStorage.clear();
  localStorage.clear();
  api.call.mockReset();
});
afterEach(() => { vi.useRealTimers(); });

/** What the app wrote for its next run, once the pause it waits for is over. */
function kept() {
  act(() => { vi.advanceTimersByTime(1000); });
  return JSON.parse(localStorage.getItem(KEPT) ?? 'null');
}

test('what the parts held comes back when the app is opened again in the same career', async () => {
  vi.useFakeTimers();
  let restore = await import('../src/restore');
  const { useSnapshot } = restore;
  function Parts() {
    useSnapshot('players', () => ({ query: 'saka', selected: 7, offset: 200 }));
    useSnapshot('settings', () => true, false);
    return null;
  }
  restore.heldFor('1:Arda');
  render(<Parts />);
  expect(kept()).toMatchObject({ career: '1:Arda', parts: { players: { query: 'saka', selected: 7, offset: 200 } } });
  expect(kept().parts.settings).toBeUndefined();

  vi.resetModules();
  restore = await import('../src/restore');
  restore.heldFor('1:Arda');
  expect(restore.restored('players', value => value)).toEqual({ query: 'saka', selected: 7, offset: 200 });
  // The Settings window comes back open after a reload only.
  expect(restore.restored('settings', value => value)).toBeUndefined();
});

test('another career starts its lists afresh, in the section the window was in', async () => {
  localStorage.setItem(KEPT, JSON.stringify({ version: 1, career: '1:Arda', parts: { view: 'clubs', players: { query: 'saka' } } }));
  const { restored, heldFor } = await import('../src/restore');
  expect(restored('view', value => value)).toBe('clubs');
  heldFor('2:Someone else');
  expect(restored('players', value => value)).toBeUndefined();
});

test('a list that left the screen, as when the game closes first, is still kept for the next run', async () => {
  vi.useFakeTimers();
  const { useSnapshot, heldFor } = await import('../src/restore');
  function Players() { useSnapshot('players', () => ({ query: 'saka' })); return null; }
  function View() { useSnapshot('view', () => 'players'); return null; }
  heldFor('1:Arda');
  const list = render(<Players />);
  render(<View />);
  list.unmount();
  expect(kept().parts).toEqual({ players: { query: 'saka' }, view: 'players' });
});

test('a reload still wins over what an earlier run left', async () => {
  localStorage.setItem(KEPT, JSON.stringify({ version: 1, career: '1:Arda', parts: { players: { query: 'earlier run' } } }));
  sessionStorage.setItem('fmlens.restore', JSON.stringify({ version: 1, parts: { players: { query: 'before the reload' } } }));
  const { restored, heldFor } = await import('../src/restore');
  heldFor('1:Arda');
  expect(restored('players', value => value)).toEqual({ query: 'before the reload' });
});

test('storage that cannot be read starts the app at its beginning', async () => {
  localStorage.setItem(KEPT, '{not json');
  const { restored } = await import('../src/restore');
  expect(restored('players', value => value)).toBeUndefined();
});

async function listOf() {
  const { ListBrowser } = await import('../src/ListBrowser');
  return (version: number, active: boolean) => (
    <ListBrowser name="fixture" command="search_fixture" version={version} active={active} placeholder="Find fixture"
      summary={n => `${n} players`} empty={() => 'Empty'} header={<th>Name</th>} cells={row => <td>{row.uid}</td>} />
  );
}

test('a list read again keeps its rows, and so its place, until the new ones are there', async () => {
  const requests: Array<(page: unknown) => void> = [];
  api.call.mockImplementation(() => new Promise(resolve => requests.push(resolve)));
  const list = await listOf();
  const mounted = render(list(0, true));
  await waitFor(() => expect(requests).toHaveLength(1));
  await act(async () => requests[0]({ total: 2, rows: [{ uid: 1 }, { uid: 2 }] }));
  await screen.findByText('2');

  // After an edit the game data has a new version.
  mounted.rerender(list(1, true));
  await waitFor(() => expect(requests).toHaveLength(2));
  expect(screen.getByText('2')).toBeTruthy();
  expect(screen.getByText('2 players')).toBeTruthy();
  expect(screen.queryByText('Searching…')).toBeNull();
  await act(async () => requests[1]({ total: 2, rows: [{ uid: 1 }, { uid: 3 }] }));
  await screen.findByText('3');
  expect(screen.queryByText('2')).toBeNull();

  // Another section and back.
  mounted.rerender(list(1, false));
  mounted.rerender(list(1, true));
  await waitFor(() => expect(requests).toHaveLength(3));
  expect(screen.getByText('3')).toBeTruthy();
  await act(async () => requests[2]({ total: 2, rows: [{ uid: 1 }, { uid: 3 }] }));

  // Another search is another list: it starts empty, at its top.
  await userEvent.type(screen.getByRole('textbox'), 'x');
  expect(screen.queryByText('3')).toBeNull();
});

test('a list goes back to where it was scrolled to once its rows are drawn', async () => {
  localStorage.setItem(KEPT, JSON.stringify({ version: 1, career: '1:Arda', parts: { fixture: { query: '', selected: null, offset: 0, argsKey: '{}', scroll: 640 } } }));
  api.call.mockResolvedValue({ total: 2, rows: [{ uid: 1 }, { uid: 2 }] });
  const scrolled = vi.spyOn(HTMLElement.prototype, 'scrollTo');
  const list = await listOf();
  render(list(0, true));
  await screen.findByText('2');
  expect(scrolled.mock.calls.at(-1)?.[0]).toEqual({ top: 640 });
});
