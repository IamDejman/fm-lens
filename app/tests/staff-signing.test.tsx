import { expect, test, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MoveButton } from '../src/MoveDialog';
import { RetirementPlan } from '../src/PlayerProfile';
import { mockInvoke } from '../src/dev/mock';
import type { LoggedChange, StaffDetails, StaffPage, StaffSummary } from '../src/types';
import { EditorContext, NO_GAME_ACTIONS } from '../src/useProfileEditing';

const staff = async (): Promise<StaffSummary[]> =>
  (await mockInvoke<StaffPage>('search_staff', { query: '', limit: 500, filter: {} })).rows;

const editor = (onEdited: () => void) => ({
  editable: true,
  readOnlyNote: '',
  onEdited,
  gameActions: { ...NO_GAME_ACTIONS, signStaff: true },
  injuryKinds: async () => [],
  gameDate: null,
  openPlayer: () => {},
  openStaff: () => {},
  findSimilar: () => {},
});

test('unemployed staff are signed for a job you pick, and it cannot be undone', async () => {
  const free = (await staff()).find((row) => row.clubUid === null && row.national === null && !row.isHuman)!;
  const user = userEvent.setup();
  const onEdited = vi.fn();
  render(
    <EditorContext.Provider value={editor(onEdited)}>
      <MoveButton player={{ uid: free.uid, name: free.name, club: null, clubUid: null }} kind="staff" contract={null} ready />
    </EditorContext.Provider>,
  );

  await user.click(screen.getByRole('button', { name: 'Sign' }));
  const dialog = screen.getByRole('dialog');
  await user.type(within(dialog).getByRole('combobox', { name: /club/i }), 'Atl');
  await user.click((await within(dialog).findAllByRole('option', { name: /Atlético Riverside/ }))[0]);

  // Coach unless you pick another job; FM writes the contract.
  const job = within(dialog).getByLabelText('Job') as HTMLSelectElement;
  await vi.waitFor(() => expect(job.selectedOptions[0]?.textContent).toBe('Coach'));
  expect(within(dialog).getByText('FM sets the wage and dates.')).toBeTruthy();
  await user.selectOptions(job, 'Scout');
  const route = await within(dialog).findByText(/Unemployed → Atlético Riverside/);
  expect(route.textContent).toContain("It can't be undone.");

  await user.click(within(dialog).getByRole('button', { name: 'Sign' }));
  await vi.waitFor(() => expect(onEdited).toHaveBeenCalled());
  expect((await staff()).find((row) => row.uid === free.uid)).toMatchObject({ club: 'Atlético Riverside', job: 14 });

  const log = await mockInvoke<LoggedChange[]>('change_log');
  const logged = log.find((change) => change.uid === free.uid)!;
  expect(logged).toMatchObject({ entity: 'staff', field: 'club', permanent: true, moved: { to: 'Atlético Riverside' } });
  await expect(mockInvoke('undo_change', { id: logged.id })).rejects.toMatchObject({ code: 'app.permanent' });
});

test("a member of staff's planned retirement is prevented, and Undo plans it again", async () => {
  const retiring = async () => {
    for (const row of await staff()) {
      const details = await mockInvoke<StaffDetails>('staff_details', { uid: row.uid });
      if (details.retires !== null && !details.isHuman) {
        return details;
      }
    }
    throw new Error('no fixture member of staff retires');
  };
  const member = await retiring();
  const user = userEvent.setup();
  const onEdited = vi.fn();
  const view = (retires: StaffDetails['retires']) => (
    <EditorContext.Provider value={editor(onEdited)}>
      <RetirementPlan uid={member.uid} retires={retires} staff />
    </EditorContext.Provider>
  );
  const { rerender } = render(view(member.retires));

  await user.click(screen.getByRole('button', { name: 'Prevent retirement' }));
  await vi.waitFor(() => expect(onEdited).toHaveBeenCalled());
  const kept = await mockInvoke<StaffDetails>('staff_details', { uid: member.uid });
  expect(kept.retires).toBeNull();

  // With none planned there is nothing to prevent: staff have no trait to play on.
  rerender(view(kept.retires));
  expect(screen.getByText('No retirement planned')).toBeTruthy();
  expect((screen.getByRole('button', { name: 'Prevent retirement' }) as HTMLButtonElement).disabled).toBe(true);

  const log = await mockInvoke<LoggedChange[]>('change_log');
  const logged = log.find((change) => change.uid === member.uid && change.field === 'retirement')!;
  expect(logged).toMatchObject({ entity: 'staff', new: 0 });
  await mockInvoke('undo_change', { id: logged.id });
  expect((await mockInvoke<StaffDetails>('staff_details', { uid: member.uid })).retires).toEqual(member.retires);
});

test('a player with no retirement planned can still be given the trait to play on', async () => {
  const onEdited = vi.fn();
  const view = (playsOn: boolean) => (
    <EditorContext.Provider value={editor(onEdited)}>
      <RetirementPlan uid={1} retires={null} playsOn={playsOn} />
    </EditorContext.Provider>
  );
  const { rerender } = render(view(false));
  expect((screen.getByRole('button', { name: 'Prevent retirement' }) as HTMLButtonElement).disabled).toBe(false);
  rerender(view(true));
  expect((screen.getByRole('button', { name: 'Prevent retirement' }) as HTMLButtonElement).disabled).toBe(true);
});
