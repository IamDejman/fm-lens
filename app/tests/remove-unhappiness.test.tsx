import { beforeEach, expect, test, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChangesView, useChangeLog } from '../src/ChangesView';
import { mockInvoke } from '../src/dev/mock';
import { call } from '../src/api';
import type { ApplyReport, FieldValues, LoggedChange, PlayerSummary } from '../src/types';
vi.mock('../src/api', () => ({ inTauri: false, call: vi.fn(), watchCommands: vi.fn() }));
beforeEach(() => { vi.mocked(call).mockImplementation(mockInvoke); });

const HAPPINESS = 'contract.happiness';
const PLAYING_TIME = 'contract.playing_time_happiness';
const REASONS = 'contract.unhappiness';
const TOP = { morale: 20, [HAPPINESS]: 100, [PLAYING_TIME]: 100, [REASONS]: 0 };

const values = (uid: number) => mockInvoke<FieldValues>('read_values', { entity: 'player', uid });
const open = async () => (await mockInvoke<LoggedChange[]>('change_log')).filter((change) => change.undoneAt === null);

/** A fixture player with a reason to be unhappy that lasts and none of his mood at its most, not yet cheered up. */
const unhappy = async () => {
  const found = await mockInvoke<{ rows: PlayerSummary[] }>('search_players', { query: '', limit: 500 });
  for (const { uid } of found.rows) {
    const now = await values(uid);
    if (now[REASONS] > 0 && now.morale < 20 && now[HAPPINESS] < 100 && now[PLAYING_TIME] < 100) {
      return { uid, before: now };
    }
  }
  throw new Error('no unhappy fixture player');
};

/** Removes his unhappiness: the reasons that ended, then what was lifted with them. */
const cheer = async () => {
  const { uid, before } = await unhappy();
  const report = await mockInvoke<ApplyReport>('remove_unhappiness', { uid });
  expect(report.failed).toEqual([]);
  expect(report.applied.map((change) => change.field)).toEqual([REASONS, 'morale', HAPPINESS, PLAYING_TIME]);
  expect(await values(uid)).toEqual({ ...before, ...TOP });
  return { uid, before, ids: report.applied.map((change) => change.id) };
};

function Changes() {
  const { log, error, reload } = useChangeLog();
  return <ChangesView log={log} error={error} reload={reload} onUndone={() => void reload()} />;
}

test('undoing one thing a removal lifted takes the rest back with it', async () => {
  const { uid, before } = await cheer();
  render(<Changes />);
  const rows = async () => (await screen.findAllByRole('row')).slice(1);
  const mine = (await open()).length;
  expect(mine).toBeGreaterThanOrEqual(4);

  // Newest first: the playing time happiness it lifted is the first row.
  await userEvent.click(within((await rows())[0]).getByRole('button', { name: 'Undo' }));
  for (const row of [0, 1, 2, 3]) {
    await within((await rows())[row]).findByText(/^Undone at/);
  }
  expect(screen.queryByRole('alert')).toBeNull();
  expect(await values(uid)).toEqual(before);
});

test('undoing the removal takes what it lifted back with it', async () => {
  const { uid, before, ids } = await cheer();
  const others = (await open()).length - ids.length;
  await mockInvoke('undo_change', { id: ids[0] });
  expect(await open()).toHaveLength(others);
  expect(await values(uid)).toEqual(before);
});

test('a morale changed since stays, and the rest still goes back', async () => {
  const { uid, before, ids } = await cheer();
  const edits = [{ field: 'morale', expected: 20, value: 19 }];
  await mockInvoke('apply_edits', { entity: 'player', uid, edits });
  await mockInvoke('undo_change', { id: ids[0] });
  expect(await values(uid)).toEqual({ ...before, morale: 19 });
});

test('an edit of morale, happiness or playing time happiness moves nothing else', async () => {
  const { uid, before } = await unhappy();
  for (const [field, value] of [[HAPPINESS, 100], ['morale', 20], [PLAYING_TIME, 100]] as const) {
    const now = await values(uid);
    const edits = [{ field, expected: now[field], value }];
    const report = await mockInvoke<ApplyReport>('apply_edits', { entity: 'player', uid, edits });
    expect(report.applied.map((change) => change.field)).toEqual([field]);
    expect(await values(uid)).toEqual({ ...now, [field]: value });
  }
  expect((await values(uid))[REASONS]).toBe(before[REASONS]);
});
