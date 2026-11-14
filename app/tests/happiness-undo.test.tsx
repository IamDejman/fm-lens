import { beforeEach, expect, test, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChangesView, useChangeLog } from '../src/ChangesView';
import { mockInvoke } from '../src/dev/mock';
import { call } from '../src/api';
import type { ApplyReport, FieldValues, LoggedChange } from '../src/types';
vi.mock('../src/api', () => ({ inTauri: false, call: vi.fn(), watchCommands: vi.fn() }));
beforeEach(() => { vi.mocked(call).mockImplementation(mockInvoke); });

const PLAYER = 1009102;
const HAPPINESS = 'contract.happiness';

const values = () => mockInvoke<FieldValues>('read_values', { entity: 'player', uid: PLAYER });
const open = async () => (await mockInvoke<LoggedChange[]>('change_log')).filter((change) => change.undoneAt === null);

/** Sets his happiness to the most there is, which only the best morale holds: the edit, then the morale it moved. */
const cheer = async () => {
  const before = await values();
  expect(before[HAPPINESS]).not.toBe(100);
  expect(before.morale).toBeLessThan(18);
  const edits = [{ field: HAPPINESS, expected: before[HAPPINESS], value: 100 }];
  const report = await mockInvoke<ApplyReport>('apply_edits', { entity: 'player', uid: PLAYER, edits });
  expect(report.applied.map((change) => change.field)).toEqual([HAPPINESS, 'morale']);
  return { before, ids: report.applied.map((change) => change.id) };
};

function Changes() {
  const { log, error, reload } = useChangeLog();
  return <ChangesView log={log} error={error} reload={reload} onUndone={() => void reload()} />;
}

test('undoing the morale a happiness edit moved takes the happiness back with it', async () => {
  const { before } = await cheer();
  render(<Changes />);
  const rows = async () => (await screen.findAllByRole('row')).slice(1);
  expect(await rows()).toHaveLength(2);

  // Newest first: the morale it moved is the first row.
  await userEvent.click(within((await rows())[0]).getByRole('button', { name: 'Undo' }));
  for (const row of [0, 1]) {
    await within((await rows())[row]).findByText(/^Undone at/);
  }
  expect(screen.queryByRole('alert')).toBeNull();
  expect(await values()).toEqual(before);
});

test('undoing the happiness edit takes the morale it moved back with it', async () => {
  const { before, ids } = await cheer();
  await mockInvoke('undo_change', { id: ids[0] });
  expect(await open()).toEqual([]);
  expect(await values()).toEqual(before);
});

test('a morale changed since stays, and the happiness still goes back', async () => {
  const { before, ids } = await cheer();
  await mockInvoke('apply_edits', { entity: 'player', uid: PLAYER, edits: [{ field: 'morale', expected: 18, value: 20 }] });
  await mockInvoke('undo_change', { id: ids[0] });
  // The morale it moved is no longer what it wrote, so that change and the later one stay listed.
  expect((await open()).map((change) => change.field)).toEqual(['morale', 'morale']);
  expect(await values()).toEqual({ ...before, morale: 20 });
});
