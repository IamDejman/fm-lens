import { beforeEach, expect, test, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const api = vi.hoisted(() => ({ call: vi.fn() }));
vi.mock('../src/api', () => ({ inTauri: false, call: api.call, watchCommands: vi.fn() }));

beforeEach(() => {
  vi.resetModules();
  sessionStorage.clear();
  localStorage.clear();
  api.call.mockReset();
  api.call.mockImplementation(async (_command, args) => {
    const offset = Number(args?.offset ?? 0);
    return { total: 450, rows: Array.from({ length: Math.min(200, 450 - offset) }, (_, i) => ({ uid: offset + i + 1 })) };
  });
});

async function mountList() {
  const { ListBrowser } = await import('../src/ListBrowser');
  return render(<ListBrowser name="fixture" command="search_fixture" version={0} active
    requestArgs={{ filter: { minAge: 20 } }} placeholder="Find fixture"
    summary={n => `${n} players`} empty={() => 'Empty'} header={<th>Name</th>}
    cells={row => <td>{row.uid}</td>} profile={row => <aside>Profile {row.uid}</aside>} />);
}

test.each([200, 400])('a settings reload restores page offset %i and its selected profile', async offset => {
  let mounted = await mountList();
  await screen.findByText('1');
  for (let page = 0; page < offset / 200; page++) {
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    await screen.findByText(String((page + 1) * 200 + 1));
  }
  await userEvent.click(screen.getByText(String(offset + 1)));
  await screen.findByText(`Profile ${offset + 1}`);
  const { saveSnapshot } = await import('../src/restore');
  saveSnapshot();
  mounted.unmount();
  vi.resetModules();
  mounted = await mountList();
  await screen.findByText(`Profile ${offset + 1}`);
  expect(screen.getByText(`${offset + 1}–${Math.min(offset + 200, 450)} of 450`)).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Next' })).toHaveProperty('disabled', offset === 400);
  mounted.unmount();
});

test('old or invalid saved page positions start safely at page one', async () => {
  sessionStorage.setItem('fmlens.restore', JSON.stringify({ version: 1, parts: { fixture: { query: '', selected: null, offset: -200 } } }));
  await mountList();
  await screen.findByText('1');
  expect(api.call.mock.calls[0][1].offset).toBe(0);
});

test('consecutive reloads retain unopened sections while mounted state takes precedence', async () => {
  sessionStorage.setItem('fmlens.restore', JSON.stringify({ version: 1, parts: {
    staff: { query: 'Arteta', selected: 6701089, offset: 0 },
    staffFields: { nation: 'Spain' }, players: { query: 'old' },
  } }));
  for (let reload = 0; reload < 2; reload++) {
    const { useSnapshot, saveSnapshot } = await import('../src/restore');
    function OnlyPlayers() { useSnapshot('players', () => ({ query: `new-${reload}` })); return <p>Players only</p>; }
    const mounted = render(<OnlyPlayers />);
    saveSnapshot();
    mounted.unmount();
    vi.resetModules();
  }
  const { restored } = await import('../src/restore');
  expect(restored('staff', value => value)).toEqual({ query: 'Arteta', selected: 6701089, offset: 0 });
  expect(restored('staffFields', value => value)).toEqual({ nation: 'Spain' });
  expect(restored('players', value => value)).toEqual({ query: 'new-1' });
});

test('column priorities follow effective list width when zoom changes without resizing', async () => {
  const box = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function(this: HTMLElement) {
    return { width: this.classList.contains('table-wrap') ? 1250 : 0, height: 500 } as DOMRect;
  });
  const mounted = await mountList();
  await screen.findByText('1');
  const table = screen.getByRole('grid').closest('.table-wrap')!;
  expect(table.getAttribute('data-list-width')).toBe('wide');
  const { setZoom } = await import('../src/appearance');
  act(() => setZoom(150));
  expect(table.getAttribute('data-list-width')).toBe('narrow');
  act(() => setZoom(125));
  expect(table.getAttribute('data-list-width')).toBe('medium');
  act(() => setZoom(100));
  await waitFor(() => expect(table.getAttribute('data-list-width')).toBe('wide'));
  mounted.unmount();
  box.mockRestore();
});

test('a new query resets a restored page before requesting results', async () => {
  sessionStorage.setItem('fmlens.restore', JSON.stringify({ version: 1, parts: { fixture: {
    query: '', offset: 200, argsKey: JSON.stringify({ filter: { minAge: 20 } }), selected: null,
  } } }));
  await mountList();
  await screen.findByText('201');
  await userEvent.type(screen.getByRole('textbox', { name: 'Find fixture' }), 'new');
  await screen.findByText('1');
  expect(api.call.mock.calls.at(-1)?.[1]).toMatchObject({ query: 'new', offset: 0 });
});

test('a restored offset is not reused for different filter arguments', async () => {
  sessionStorage.setItem('fmlens.restore', JSON.stringify({ version: 1, parts: { fixture: {
    query: '', offset: 200, argsKey: JSON.stringify({ filter: { minAge: 30 } }), selected: null,
  } } }));
  await mountList();
  await screen.findByText('1');
  expect(api.call.mock.calls[0][1].offset).toBe(0);
});
