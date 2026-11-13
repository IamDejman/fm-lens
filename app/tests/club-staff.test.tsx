import { expect, test, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ClubStaffTab } from '../src/ClubStaffTab';
import type { StaffSummary } from '../src/types';
import { EditorContext, NO_GAME_ACTIONS } from '../src/useProfileEditing';

const FIRST_TEAM = { index: 0, kind: 0, ageLimit: null };
const U21 = { index: 1, kind: 10, ageLimit: 21 };
const U18 = { index: 2, kind: 12, ageLimit: 18 };

function member(
  uid: number,
  name: string,
  job: number | null,
  currentAbility: number,
  team: StaffSummary['team'] = FIRST_TEAM,
): StaffSummary {
  return {
    uid,
    name,
    fullName: null,
    dateOfBirth: null,
    age: 40,
    nation: 'England',
    nationUid: null,
    club: 'Northbridge FC',
    clubUid: 500,
    team,
    job,
    national: null,
    currentAbility,
    potentialAbility: currentAbility,
    isHuman: false,
  };
}

const STAFF = [
  member(1, 'Owen Owner', 66, 50),
  member(2, 'Sam Scout', 14, 90),
  member(3, 'Ada Assistant', 20, 120),
  member(4, 'Cole Coach', 2, 100),
  member(5, 'Max Manager', 16, 140),
  member(6, 'Pat Playercoach', 3, 110),
  member(7, 'Uma Undertwentyone', 16, 95, U21),
  member(8, 'Yan Youthcoach', 2, 80, U18),
  member(9, 'Yuri Youthmanager', 16, 85, U18),
];

vi.mock('../src/dev/mock', () => ({
  mockInvoke: async (command: string, args?: { uid?: number }) =>
    command === 'club_staff' && args?.uid === 500 ? STAFF : [],
}));

function renderTab(openStaff = vi.fn(), clubUid = 500) {
  render(
    <EditorContext.Provider
      value={{
        editable: true,
        readOnlyNote: '',
        onEdited: () => {},
        gameActions: NO_GAME_ACTIONS,
        injuryKinds: async () => [],
        gameDate: null,
        openPlayer: () => {},
        openStaff,
        findSimilar: () => {},
      }}
    >
      <ClubStaffTab clubUid={clubUid} clubName="Northbridge FC" version={0} panel={{ id: 'p', labelledBy: 't' }} />
    </EditorContext.Provider>,
  );
  return openStaff;
}

test("lists the first team's staff, the manager and the coaches first and the board last", async () => {
  renderTab();
  const table = await screen.findByRole('table', { name: 'Staff of Northbridge FC, First team' });
  const names = within(table)
    .getAllByRole('button')
    .map((button) => button.textContent);
  expect(names).toEqual(['Max Manager', 'Ada Assistant', 'Pat Playercoach', 'Cole Coach', 'Sam Scout', 'Owen Owner']);
});

test("the switch shows each team's own staff, its manager first", async () => {
  renderTab();
  const teams = await screen.findByRole('group', { name: 'Team' });
  expect(within(teams).getAllByRole('button').map((button) => button.textContent)).toEqual(['First team', 'U21', 'U18']);
  await userEvent.click(within(teams).getByRole('button', { name: 'U18' }));
  const table = screen.getByRole('table', { name: 'Staff of Northbridge FC, U18' });
  expect(within(table).getAllByRole('button').map((button) => button.textContent)).toEqual([
    'Yuri Youthmanager',
    'Yan Youthcoach',
  ]);
});

test('a row opens the member of staff in the staff list', async () => {
  const openStaff = renderTab();
  await userEvent.click(await screen.findByRole('button', { name: 'Sam Scout' }));
  expect(openStaff).toHaveBeenCalledWith(2);
});

test('a club without staff says so', async () => {
  renderTab(vi.fn(), 501);
  expect(await screen.findByText('This club has no staff.')).toBeTruthy();
});
