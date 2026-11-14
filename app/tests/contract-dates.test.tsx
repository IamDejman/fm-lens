import { beforeEach, expect, test, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect, useState } from 'react';
import { ContractDates } from '../src/ProfileParts';
import { EditorContext, NO_GAME_ACTIONS, SessionContext, useProfileEditing } from '../src/useProfileEditing';
import { mockInvoke } from '../src/dev/mock';
import { call } from '../src/api';
import type { PlayerDetails } from '../src/types';
vi.mock('../src/api', () => ({ inTauri: false, call: vi.fn(), watchCommands: vi.fn() }));
beforeEach(() => { vi.mocked(call).mockImplementation(mockInvoke); });

const UID = 1009102;

// The contract's dates as a profile shows them: read from the game, then again after each edit.
function Profile({ version }: { version: number }) {
  const [contract, setContract] = useState<PlayerDetails['contract']>(null);
  const edit = useProfileEditing('player', UID);
  useEffect(() => {
    void mockInvoke<PlayerDetails>('player_details', { uid: UID }).then((details) => setContract(details.contract));
  }, [version]);
  return <SessionContext.Provider value={edit.session}>
    <button onClick={() => edit.begin()}>Edit</button>
    {edit.session && <button onClick={edit.apply}>Apply</button>}
    {contract && <ContractDates contract={contract} />}
    <p data-testid="joined">{contract?.joined ? `${contract.joined.year}-${contract.joined.month}-${contract.joined.day}` : ''}</p>
  </SessionContext.Provider>;
}

// The editor as the app provides it: an edit has the profile read the game again.
function Harness() {
  const [version, setVersion] = useState(0);
  return <EditorContext.Provider value={{ editable: true, readOnlyNote: '', onEdited: () => setVersion((v) => v + 1), gameActions: NO_GAME_ACTIONS, injuryKinds: async () => [], gameDate: null, openPlayer() {}, openStaff() {} }}>
    <Profile version={version} />
  </EditorContext.Provider>;
}

test('the days a contract was signed and its holder joined are edited like its end, up to the day of the game', async () => {
  const user = userEvent.setup();
  render(<Harness />);
  await waitFor(() => expect(screen.getByTestId('joined').textContent).toBe('2022-8-15'));
  // While the profile is read, no date is an input.
  expect(screen.queryByLabelText('Joined club')).toBeNull();

  await user.click(screen.getByRole('button', { name: 'Edit' }));
  const joined = await screen.findByLabelText<HTMLInputElement>('Joined club');
  expect(screen.getByLabelText('Contract signed')).toBeTruthy();
  expect(screen.getByLabelText('Contract end')).toBeTruthy();

  // The fixture's game is on 18 July 2026: a day after it is refused.
  await user.click(joined);
  await user.keyboard('19072026');
  await waitFor(() => expect(joined.getAttribute('aria-invalid')).toBe('true'));

  // A day before it is written, and the profile reads it back.
  await user.click(joined);
  await user.keyboard('{Control>}a{/Control}01072020');
  await waitFor(() => expect(joined.getAttribute('aria-invalid')).toBeNull());
  await user.click(screen.getByRole('button', { name: 'Apply' }));
  await waitFor(() => expect(screen.getByTestId('joined').textContent).toBe('2020-7-1'));
});
