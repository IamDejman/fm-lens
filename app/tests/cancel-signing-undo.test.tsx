import { expect, test, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { ChangesView } from '../src/ChangesView';
import { mockInvoke } from '../src/dev/mock';
import type { LoggedChange, PlayerPage, ClubPage } from '../src/types';
vi.mock('../src/api', async () => {
  const { mockInvoke } = await import('../src/dev/mock');
  return { inTauri: false, call: mockInvoke, watchCommands: vi.fn() };
});

test('cancel transfer removes the original signing Undo and preserves unrelated signing Undo', async () => {
  const players = await mockInvoke<PlayerPage>('search_players', { query: '', filter: { freeAgents: true }, limit: 2 });
  const clubs = await mockInvoke<ClubPage>('search_clubs', { query: '', filter: {}, limit: 1 });
  const first = players.rows[0]!;
  const second = players.rows[1]!;
  const club = clubs.rows[0]!;
  const sign = (uid: number) => mockInvoke<LoggedChange>('sign_free_agent_later', { uid, club: club.uid, joins: 20280101 });
  const a = await sign(first.uid);
  const b = await sign(second.uid);
  const load = () => mockInvoke<LoggedChange[]>('change_log');
  const view = render(<ChangesView log={await load()} error={null} reload={() => {}} onUndone={() => {}} />);
  await waitFor(() => expect(screen.getAllByRole('button', { name: 'Undo' })).toHaveLength(2));
  await mockInvoke('cancel_future_transfers', { uid: first.uid });
  const log = await load();
  expect(log.find(change => change.id === a.id)?.permanent).toBe(true);
  expect(log.find(change => change.id === a.id)?.undoneAt).toBeNull();
  expect(log.find(change => change.id === b.id)?.permanent).not.toBe(true);
  view.rerender(<ChangesView log={log} error={null} reload={() => {}} onUndone={() => {}} />);
  expect(screen.getAllByRole('button', { name: 'Undo' })).toHaveLength(1);
  await expect(mockInvoke('undo_change', { id: a.id })).rejects.toMatchObject({ code: 'app.permanent' });
});
