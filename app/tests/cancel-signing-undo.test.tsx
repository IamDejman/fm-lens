import { expect, test, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { ChangesView } from '../src/ChangesView';
import { mockInvoke } from '../src/dev/mock';
import type { ClubPage, LoggedChange, PlannedCancel, PlayerPage } from '../src/types';
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
  // The cancellation itself can be undone: it is one of FM Lens's own signings.
  const cancelled = log.find(change => change.field === 'future_transfer' && change.uid === first.uid)!;
  expect(cancelled.permanent).not.toBe(true);
  view.rerender(<ChangesView log={log} error={null} reload={() => {}} onUndone={() => {}} />);
  expect(screen.getAllByRole('button', { name: 'Undo' })).toHaveLength(2);
  await expect(mockInvoke('undo_change', { id: a.id })).rejects.toMatchObject({ code: 'app.permanent' });

  // Undoing it agrees the signing again, and the signing's own row undoes it once more.
  await mockInvoke('undo_change', { id: cancelled.id });
  const plan = await mockInvoke<PlannedCancel[]>('plan_cancel_future_transfers', { uid: first.uid });
  expect(plan).toMatchObject([{ clubUid: club.uid, undoable: true }]);
  expect((await load()).find(change => change.id === a.id)?.permanent).not.toBe(true);
  await mockInvoke('undo_change', { id: a.id });
  await expect(mockInvoke('plan_cancel_future_transfers', { uid: first.uid })).rejects.toMatchObject({
    code: 'move.notPending',
  });
});

test("cancelling a transfer FM agreed itself can't be undone", async () => {
  const players = await mockInvoke<PlayerPage>('search_players', { query: '', filter: {}, limit: 200 });
  const dealt = players.rows.find(player => player.club !== null && player.uid % 13 === 0)!;
  const plan = await mockInvoke<PlannedCancel[]>('plan_cancel_future_transfers', { uid: dealt.uid });
  expect(plan.every(transfer => !transfer.undoable)).toBe(true);
  const [cancelled] = await mockInvoke<LoggedChange[]>('cancel_future_transfers', { uid: dealt.uid });
  expect(cancelled!.permanent).toBe(true);
});
