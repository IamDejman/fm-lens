import { beforeEach, expect, test, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MoraleGroup } from '../src/PlayerProfile';
import { EditorContext, NO_GAME_ACTIONS } from '../src/useProfileEditing';
import { call } from '../src/api';
import type { Concern, Contract, PlayerDetails } from '../src/types';

vi.mock('../src/api', () => ({ inTauri: false, call: vi.fn(), watchCommands: vi.fn() }));
const edited = vi.fn();
beforeEach(() => { vi.mocked(call).mockReset(); edited.mockReset(); });

const lasting: Concern = { started: null, ended: null, motive: 570, kind: 2 };
const over: Concern = { ...lasting, ended: { year: 2027, month: 12, day: 1 } };
const player = (morale: number, concerns: Concern[] | null): Pick<PlayerDetails, 'uid' | 'morale' | 'contract'> => ({
  uid: 123,
  morale,
  contract: concerns && ({ happiness: 0, playingTimeHappiness: 0, concerns } as unknown as Contract),
});
function View({ details, editable = true }: { details: ReturnType<typeof player>; editable?: boolean }) {
  return <EditorContext.Provider value={{ editable, readOnlyNote: 'Read only', onEdited: edited,
    gameActions: NO_GAME_ACTIONS, injuryKinds: async () => [], gameDate: null, openPlayer() {}, openStaff() {}, findSimilar() {} }}>
    <MoraleGroup details={details} />
  </EditorContext.Provider>;
}
const inspire = () => screen.getByRole('button', { name: 'Inspire' }) as HTMLButtonElement;
const commands = () => vi.mocked(call).mock.calls.map(([command]) => command);
/** What the game answers: a morale edit that is written, or one it refuses; and reasons it ends, or will not. */
function answer({ morale = true, reasons = true } = {}) {
  const stale = { code: 'edit.stale', params: {}, message: 'The game changed this value.' };
  vi.mocked(call).mockImplementation((command: string) =>
    command === 'apply_edits'
      ? Promise.resolve(morale ? { applied: [{}], failed: [] } : { applied: [], failed: [{ field: 'morale', value: 20, error: stale }] })
      : reasons ? Promise.resolve({}) : Promise.reject(stale));
}

test('Inspire sets top morale over what the profile read, ends his reasons, then has the profile read again', async () => {
  answer();
  render(<View details={player(12, [lasting, over])} />);
  await userEvent.click(inspire());
  expect(call).toHaveBeenCalledWith('apply_edits', { entity: 'player', uid: 123,
    edits: [{ field: 'morale', expected: 12, value: 20 }] });
  // The reasons end as Remove all ends them, not by a write to their count.
  expect(call).toHaveBeenCalledWith('remove_unhappiness', { uid: 123 });
  expect(call).toHaveBeenCalledTimes(2);
  expect(edited).toHaveBeenCalledTimes(1);
});

test('Inspire does only what is short of the top', async () => {
  answer();
  const view = render(<View details={player(20, [lasting])} />);
  await userEvent.click(inspire());
  expect(commands()).toEqual(['remove_unhappiness']);
  vi.mocked(call).mockClear();
  // A reason that is over needs no ending, and a free agent has no contract to hold one.
  view.rerender(<View details={player(7, [over])} />);
  await userEvent.click(inspire());
  view.rerender(<View details={player(7, null)} />);
  await userEvent.click(inspire());
  expect(commands()).toEqual(['apply_edits', 'apply_edits']);
});

test('Inspire waits for a player who is short of the top, and for a game that can be written to', () => {
  const view = render(<View details={player(20, [over])} />);
  expect(inspire().disabled).toBe(true);
  view.rerender(<View details={player(12, [])} editable={false} />);
  expect(inspire().disabled).toBe(true);
  expect(inspire().title).toBe('Read only');
  expect(call).not.toHaveBeenCalled();
});

test('a refused morale write is said, and his reasons still end', async () => {
  answer({ morale: false });
  render(<View details={player(12, [lasting])} />);
  await userEvent.click(inspire());
  expect((await screen.findByRole('alert')).textContent).toBeTruthy();
  expect(commands()).toEqual(['apply_edits', 'remove_unhappiness']);
  expect(edited).toHaveBeenCalledTimes(1);
  // Not left busy: the button can be pressed again.
  expect(inspire().getAttribute('aria-disabled')).toBeNull();
});
