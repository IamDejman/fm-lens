import { beforeEach, expect, test, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useMemo, useState } from 'react';
import { useChangeLog } from '../src/ChangesView';
import { standingFields, undoChange } from '../src/editing';
import { EditorContext, NO_GAME_ACTIONS, StandingFieldsContext, useProfileEditing } from '../src/useProfileEditing';
import { mockInvoke } from '../src/dev/mock';
import { call } from '../src/api';
import type { LoggedChange } from '../src/types';
vi.mock('../src/api', () => ({ inTauri: false, call: vi.fn(), watchCommands: vi.fn() }));
beforeEach(() => { vi.mocked(call).mockImplementation(mockInvoke); });

const FIRST = 1009102;
const OTHER = 1000037;

// One profile's editing, as the profiles use it: the real hook over the fixture command adapter.
function Profile({ uid }: { uid: number }) {
  const edit = useProfileEditing('player', uid);
  const type = (field: string) => (e: React.ChangeEvent<HTMLInputElement>) => edit.session?.type(field, e.target.value);
  return <>
    <button onClick={() => edit.begin()}>Edit</button>
    {edit.session && <>
      <input aria-label="Finishing" value={edit.session.input('attribute.finishing')?.text ?? ''} onChange={type('attribute.finishing')} />
      <input aria-label="Crossing" value={edit.session.input('attribute.crossing')?.text ?? ''} onChange={type('attribute.crossing')} />
      <button onClick={edit.apply}>Apply</button>
    </>}
    <p data-testid="applied">{[...edit.appliedFields].sort().join(' ')}</p>
  </>;
}

// The log and the marks wired as the app wires them: an edit or an undo reads the log again.
function Harness() {
  const { log, reload } = useChangeLog();
  const standing = useMemo(() => standingFields(log), [log]);
  const [uid, setUid] = useState(FIRST);
  const newest = log.find((change) => change.undoneAt === null);
  return <EditorContext.Provider value={{ editable: true, readOnlyNote: '', onEdited: () => void reload(), gameActions: NO_GAME_ACTIONS, injuryKinds: async () => [], gameDate: null, openPlayer() {}, openStaff() {} }}>
    <StandingFieldsContext.Provider value={standing}>
      <Profile key={uid} uid={uid} />
      <button onClick={() => setUid(uid === FIRST ? OTHER : FIRST)}>Other profile</button>
      <button onClick={() => newest && void undoChange(newest.id).then(reload)}>Undo newest</button>
    </StandingFieldsContext.Provider>
  </EditorContext.Provider>;
}

async function apply(label: string, value: string) {
  await userEvent.click(screen.getByRole('button', { name: 'Edit' }));
  const input = await screen.findByRole('textbox', { name: label });
  await userEvent.clear(input);
  await userEvent.type(input, value);
  await userEvent.click(screen.getByRole('button', { name: 'Apply' }));
}

const applied = () => screen.getByTestId('applied').textContent;

test('applied marks add up over Applies, outlive the profile and go with Undo', async () => {
  render(<Harness />);
  await apply('Finishing', '12');
  await waitFor(() => expect(applied()).toBe('attribute.finishing'));

  // A later Apply keeps the marks of the one before.
  await apply('Crossing', '9');
  await waitFor(() => expect(applied()).toBe('attribute.crossing attribute.finishing'));

  // Another profile has none of them; coming back, they are there again.
  await userEvent.click(screen.getByRole('button', { name: 'Other profile' }));
  await waitFor(() => expect(applied()).toBe(''));
  await userEvent.click(screen.getByRole('button', { name: 'Other profile' }));
  await waitFor(() => expect(applied()).toBe('attribute.crossing attribute.finishing'));

  // Undoing a change takes its mark away, and only its own.
  await userEvent.click(screen.getByRole('button', { name: 'Undo newest' }));
  await waitFor(() => expect(applied()).toBe('attribute.finishing'));
});

test('a field stays marked while any change to it stands, and changes of an earlier game mark nothing', () => {
  const change = (id: number, more: Partial<LoggedChange>): LoggedChange => ({
    id, at: id, name: 'Fixture', entity: 'player', uid: FIRST, field: 'attribute.finishing', old: 95, new: 60, undoneAt: null, batch: null, ...more,
  });
  const fields = (log: LoggedChange[]) => [...(standingFields(log).get(`player:${FIRST}`) ?? [])];

  // Edited twice, the newer change undone: the older one still stands.
  expect(fields([change(2, { undoneAt: 5 }), change(1, {})])).toEqual(['attribute.finishing']);
  expect(fields([change(2, { undoneAt: 5 }), change(1, { undoneAt: 6 })])).toEqual([]);
  expect(fields([change(1, { earlierGame: true })])).toEqual([]);
  // The same UID in another list is another profile.
  expect(fields([change(1, { entity: 'staff' })])).toEqual([]);
});
