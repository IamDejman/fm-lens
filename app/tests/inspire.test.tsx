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
    gameActions: NO_GAME_ACTIONS, injuryKinds: async () => [], gameDate: null, openPlayer() {}, openStaff() {} }}>
    <MoraleGroup details={details} />
  </EditorContext.Provider>;
}
const inspire = () => screen.getByRole('button', { name: 'Inspire' }) as HTMLButtonElement;

test('Inspire sends top morale and no unhappiness over what the profile read, then has it read again', async () => {
  vi.mocked(call).mockResolvedValue({ applied: [{}, {}], failed: [] });
  render(<View details={player(12, [lasting, over])} />);
  await userEvent.click(inspire());
  expect(call).toHaveBeenCalledTimes(1);
  expect(call).toHaveBeenCalledWith('apply_edits', { entity: 'player', uid: 123, edits: [
    { field: 'morale', expected: 12, value: 20 },
    // The game keeps the reasons that are over in the same list: its whole count is what goes to none.
    { field: 'contract.unhappiness', expected: 2, value: 0 },
  ] });
  expect(edited).toHaveBeenCalledTimes(1);
});

test('Inspire sends only what is short of the top', async () => {
  vi.mocked(call).mockResolvedValue({ applied: [{}], failed: [] });
  const view = render(<View details={player(20, [lasting])} />);
  await userEvent.click(inspire());
  expect(call).toHaveBeenLastCalledWith('apply_edits', expect.objectContaining({
    edits: [{ field: 'contract.unhappiness', expected: 1, value: 0 }] }));
  // A free agent has no contract, and so no reasons to clear.
  view.rerender(<View details={player(7, null)} />);
  await userEvent.click(inspire());
  expect(call).toHaveBeenLastCalledWith('apply_edits', expect.objectContaining({
    edits: [{ field: 'morale', expected: 7, value: 20 }] }));
});

test('Inspire waits for a player who is short of the top, and for a game that can be written to', () => {
  const view = render(<View details={player(20, [over])} />);
  expect(inspire().disabled).toBe(true);
  view.rerender(<View details={player(12, [])} editable={false} />);
  expect(inspire().disabled).toBe(true);
  expect(inspire().title).toBe('Read only');
  expect(call).not.toHaveBeenCalled();
});

test('a refused write is said, and the button can be pressed again', async () => {
  vi.mocked(call).mockResolvedValue({ applied: [], failed: [
    { field: 'morale', value: 20, error: { code: 'edit.stale', params: {}, message: 'The game changed this value.' } } ] });
  render(<View details={player(12, [])} />);
  await userEvent.click(inspire());
  expect((await screen.findByRole('alert')).textContent).toBeTruthy();
  expect(inspire().getAttribute('aria-disabled')).toBeNull();
});
