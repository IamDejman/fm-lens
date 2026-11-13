import { beforeEach, expect, test, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChangesView, useChangeLog } from '../src/ChangesView';
import { describeFieldError } from '../src/editDraft';
import { changedLater } from '../src/editing';
import { undoFailureLines, undoFailureText } from '../src/massDraft';
import { mockInvoke } from '../src/dev/mock';
import { call } from '../src/api';
import type { EditField, Failure, FieldValues, LoggedChange } from '../src/types';
vi.mock('../src/api', () => ({ inTauri: false, call: vi.fn(), watchCommands: vi.fn() }));
beforeEach(() => { vi.mocked(call).mockImplementation(mockInvoke); });

const PLAYER = 1009102;
const FINISHING = 'attribute.finishing';

const playerField = async (key: string): Promise<EditField> => {
  const table = await mockInvoke<EditField[]>('edit_fields', { entity: 'player' });
  return table.find((field) => field.key === key)!;
};

// The game stores an attribute on a finer scale than it shows: 60 is shown as 12, 50 as 10.
const conflict = (field: string, expected: number, found: number): Failure => ({
  code: 'edit.conflict', message: 'the value has changed', params: { field, expected: String(expected), found: String(found) },
});

const change = (id: number, more: Partial<LoggedChange> = {}): LoggedChange => ({
  id, at: id, name: 'Fixture', entity: 'player', uid: PLAYER, field: FINISHING, old: 95, new: 60, undoneAt: null, batch: null, ...more,
});

test('a refusal names the value as the app shows it, not as the game stores it', async () => {
  const finishing = await playerField(FINISHING);
  expect(describeFieldError(conflict(FINISHING, 60, 50), finishing)).toBe('FM has since changed Finishing to 10, so it was left alone.');
  // Without the field, or for a failure about another one, the values stay as they came.
  expect(describeFieldError(conflict(FINISHING, 60, 50), undefined)).toBe('FM has since changed Finishing to 50, so it was left alone.');
  expect(describeFieldError(conflict('attribute.crossing', 60, 50), finishing)).toBe('FM has since changed Crossing to 50, so it was left alone.');
});

test('an undo behind a later change of the same field says to undo that one first', async () => {
  const finishing = await playerField(FINISHING);
  const older = change(1);
  const newer = change(2, { old: 60, new: 50 });
  const later = 'Finishing was changed again after this. Undo the later change first.';
  const fm = 'FM has since changed Finishing to 10, so it was left alone.';

  expect(changedLater(older, [newer, older])).toBe(true);
  expect(changedLater(newer, [newer, older])).toBe(false);
  expect(undoFailureText(older, conflict(FINISHING, 60, 50), [newer, older], finishing)).toBe(later);

  // The later change undone, in an earlier game, of another field or of another profile: it was FM.
  for (const other of [{ undoneAt: 9 }, { earlierGame: true }, { field: 'attribute.crossing' }, { uid: PLAYER + 37 }, { entity: 'staff' as const }]) {
    expect(undoFailureText(older, conflict(FINISHING, 60, 50), [change(2, other), older], finishing)).toBe(fm);
  }
  // Only a refusal for the value says so: any other failure keeps its own words.
  const closed: Failure = { code: 'session.noSuchProcess', message: 'no such process', params: {} };
  expect(undoFailureText(older, closed, [newer, older], finishing)).toBe('FM closed or restarted. Load a save and connect again.');

  // The changes of a batch that could not be taken back are told the same way.
  const fields = new Map([[`player:${FINISHING}`, finishing]]);
  expect(undoFailureLines([{ id: 1, error: conflict(FINISHING, 60, 50) }], [newer, older], fields)[0]).toContain(later);
  expect(undoFailureLines([{ id: 1, error: conflict(FINISHING, 60, 50) }], [older], fields)[0]).toContain(fm);
});

function Changes() {
  const { log, error, reload } = useChangeLog();
  return <ChangesView log={log} error={error} reload={reload} onUndone={() => void reload()} />;
}

test('the Changes page refuses an out-of-order Undo in plain words, and takes them back newest first', async () => {
  const stored = (await mockInvoke<FieldValues>('read_values', { entity: 'player', uid: PLAYER }))[FINISHING]!;
  await mockInvoke('apply_edits', { entity: 'player', uid: PLAYER, edits: [{ field: FINISHING, expected: stored, value: 60 }] });
  await mockInvoke('apply_edits', { entity: 'player', uid: PLAYER, edits: [{ field: FINISHING, expected: 60, value: 50 }] });

  render(<Changes />);
  const rows = async () => (await screen.findAllByRole('row')).slice(1);
  expect(await rows()).toHaveLength(2);

  // The older change first: refused, and nothing about what the game stores.
  await userEvent.click(within((await rows())[1]).getByRole('button', { name: 'Undo' }));
  const refusal = await screen.findByRole('alert');
  expect(refusal.textContent).toBe('Finishing was changed again after this. Undo the later change first.');

  // As it says: the later one, then this one.
  await userEvent.click(within((await rows())[0]).getByRole('button', { name: 'Undo' }));
  await within((await rows())[0]).findByText(/^Undone at/);
  await userEvent.click(within((await rows())[1]).getByRole('button', { name: 'Undo' }));
  await within((await rows())[1]).findByText(/^Undone at/);
  expect(screen.queryByRole('alert')).toBeNull();
  expect((await mockInvoke<FieldValues>('read_values', { entity: 'player', uid: PLAYER }))[FINISHING]).toBe(stored);
});
