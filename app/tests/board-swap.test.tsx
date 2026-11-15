import { expect, test, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChangesView, useChangeLog } from '../src/ChangesView';
import { MoveButton } from '../src/MoveDialog';
import { mockInvoke } from '../src/dev/mock';
import type { LoggedChange, StaffDetails, StaffPage, StaffSummary } from '../src/types';
import { EditorContext, NO_GAME_ACTIONS } from '../src/useProfileEditing';

// The fixture boards: an owner and a director at Northbridge FC, a chairperson and a director at Atlético Riverside.
const OWNER = 2_900_000;
const CHAIR = 2_900_002;
const DIRECTOR = 2_900_003;

const member = async (uid: number): Promise<StaffSummary> => {
  const page = await mockInvoke<StaffPage>('search_staff', { query: '', limit: 500, filter: {} });
  return page.rows.find((row) => row.uid === uid)!;
};

function Changes() {
  const { log, error, reload } = useChangeLog();
  return <ChangesView log={log} error={error} reload={reload} onUndone={() => void reload()} />;
}

test('only a board member is offered a seat swap', async () => {
  expect((await mockInvoke<StaffDetails>('staff_details', { uid: OWNER })).boardSeat).toBe(true);
  // The fixture manager, who is you, and a member of staff with another job.
  const page = await mockInvoke<StaffPage>('search_staff', { query: '', limit: 500, filter: {} });
  for (const other of [page.rows.find((row) => row.isHuman)!, page.rows.find((row) => row.job === 2)!]) {
    expect((await mockInvoke<StaffDetails>('staff_details', { uid: other.uid })).boardSeat).toBe(false);
  }
});

test('a ranked staff list leaves the board out until it is searched', async () => {
  const best = { weights: [{ key: 'attacking', weight: 1 }], positions: [] };
  const search = (query: string) => mockInvoke<StaffPage>('search_staff', { query, limit: 500, filter: {}, best });
  expect((await search('')).rows.some((row) => row.uid === OWNER)).toBe(false);
  expect((await search('Marta Feld')).rows.map((row) => row.uid)).toEqual([OWNER]);
  expect((await search(String(OWNER))).rows.map((row) => row.uid)).toEqual([OWNER]);
});

test('a board member swaps seats with one of another board, and Undo puts both back', async () => {
  const user = userEvent.setup();
  const onEdited = vi.fn();
  render(
    <EditorContext.Provider
      value={{
        editable: true,
        readOnlyNote: '',
        onEdited,
        gameActions: NO_GAME_ACTIONS,
        injuryKinds: async () => [],
        gameDate: null,
        openPlayer: () => {},
        openStaff: () => {},
        findSimilar: () => {},
      }}
    >
      <MoveButton
        player={{ uid: OWNER, name: 'Marta Feld', club: 'Northbridge FC', clubUid: 500 }}
        kind="board"
        contract={null}
        ready
      />
    </EditorContext.Provider>,
  );

  await user.click(screen.getByRole('button', { name: 'Swap seat' }));
  const dialog = screen.getByRole('dialog', { name: 'Swap seat' });
  expect(within(dialog).getByText("Pick the other member's club.")).toBeTruthy();

  await user.type(within(dialog).getByRole('combobox'), 'Atl');
  // The men's club comes before its women's club.
  await user.click((await within(dialog).findAllByRole('option', { name: /Atlético Riverside/ }))[0]);

  // The club's board, the most senior seat first, with the keyboard on the list.
  const board = within(dialog).getByRole('listbox', { name: 'Board members' });
  const seats = await within(board).findAllByRole('option');
  // Each row: the initials that stand in for a face, the name, the seat's job.
  expect(seats.map((seat) => seat.textContent)).toEqual(['SASelin AydinChairperson', 'IHIan HoltDirector']);
  expect(document.activeElement).toBe(board);
  expect(within(dialog).getByText('Pick the member to swap with.')).toBeTruthy();

  await user.keyboard('{ArrowDown}{Enter}');
  expect(await within(dialog).findByText(/Marta Feld → Atlético Riverside \(Director\)/)).toBeTruthy();
  expect(within(dialog).getByText(/Ian Holt → Northbridge FC \(Owner\)/)).toBeTruthy();

  await user.click(within(dialog).getByRole('button', { name: 'Swap' }));
  await vi.waitFor(() => expect(onEdited).toHaveBeenCalled());
  expect(await member(OWNER)).toMatchObject({ club: 'Atlético Riverside', job: 6 });
  expect(await member(DIRECTOR)).toMatchObject({ club: 'Northbridge FC', job: 66 });

  const [logged] = await mockInvoke<LoggedChange[]>('change_log');
  expect(logged).toMatchObject({
    entity: 'staff',
    uid: OWNER,
    field: 'club',
    moved: { from: 'Northbridge FC', to: 'Atlético Riverside', with: 'Ian Holt' },
  });

  await mockInvoke('undo_change', { id: logged.id });
  expect(await member(OWNER)).toMatchObject({ club: 'Northbridge FC', job: 66 });
  expect(await member(DIRECTOR)).toMatchObject({ club: 'Atlético Riverside', job: 6 });
});

test('a swap within one board is listed as a change of job', async () => {
  await mockInvoke('swap_board', { uid: CHAIR, other: DIRECTOR });
  expect(await member(CHAIR)).toMatchObject({ club: 'Atlético Riverside', job: 6 });
  expect(await member(DIRECTOR)).toMatchObject({ club: 'Atlético Riverside', job: 4 });

  render(<Changes />);
  const row = (await screen.findAllByRole('row'))[1];
  expect(within(row).getByText('Selin Aydin')).toBeTruthy();
  expect(row.textContent).toContain('Chairperson');
  expect(row.textContent).toContain('Director');
  expect(within(row).getByText('Swapped with Ian Holt')).toBeTruthy();
});

test('a seat swap is refused for you and for anyone without a seat', async () => {
  const page = await mockInvoke<StaffPage>('search_staff', { query: '', limit: 500, filter: {} });
  const you = page.rows.find((row) => row.isHuman)!;
  const coach = page.rows.find((row) => row.job === 2)!;
  await expect(mockInvoke('plan_board_swap', { uid: OWNER, other: you.uid })).rejects.toMatchObject({ code: 'staff.you' });
  await expect(mockInvoke('plan_board_swap', { uid: OWNER, other: coach.uid })).rejects.toMatchObject({
    code: 'board.notSeat',
  });
  await expect(mockInvoke('plan_board_swap', { uid: OWNER, other: OWNER })).rejects.toMatchObject({
    code: 'board.unusual',
  });
});
