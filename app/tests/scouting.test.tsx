import { expect, test, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { countFilters, NO_PLAYER_FILTERS, toPlayerFilter } from '../src/PlayerFilters';
import { PlayerBrowser } from '../src/PlayerBrowser';
import { readFields, readOrder } from '../src/savedFilters';
import { ScoutTab } from '../src/ScoutParts';
import { roleLabel, roleShort } from '../src/scoutRoles';
import type { PlayerDetails, PlayerRow, ScoutReport } from '../src/types';
import { EditorContext, NO_GAME_ACTIONS } from '../src/useProfileEditing';

const calls: { command: string; args?: Record<string, unknown> }[] = [];

const REPORT: ScoutReport = {
  potential: 175,
  peak: { finishing: 17, passing: 14 },
  development: { probability: 62, gain: 21.4, halfStars: 7 },
  roles: [{ role: 'advanced_forward.attack', today: 71, peak: 84 }],
  careers: [
    {
      manager: 'Alex Morgan',
      club: 'Northbridge Athletic',
      points: [{ year: 2027, age: 19, currentAbility: 131, potentialAbility: 175 }],
    },
  ],
};

function row(uid: number, name: string, similarity: number | null): PlayerRow {
  return {
    uid,
    name,
    fullName: null,
    dateOfBirth: null,
    age: 20,
    nation: 'England',
    nationUid: null,
    club: 'Northbridge',
    clubUid: 1,
    positions: ['st'],
    contractExpires: null,
    currentAbility: 120,
    potentialAbility: 160,
    value: null,
    wage: null,
    currentReputation: 5000,
    similarity,
    development: 40,
    progress: 6,
    roles: { 'poacher.attack': 66 },
    rank: null,
  };
}

vi.mock('../src/dev/mock', () => ({
  mockInvoke: async (command: string, args?: Record<string, unknown>) => {
    calls.push({ command, args });
    if (command === 'player_scout') {
      return REPORT;
    }
    if (command === 'search_players') {
      return { total: 1, rows: [row(2, 'Ben Bright', args?.similar ? 88 : null)] };
    }
    return [];
  },
}));

test('the scouting filters reach the search, a role without a minimum only as a column', () => {
  const fields = {
    ...NO_PLAYER_FILTERS,
    basedIn: ' Spain ',
    minDevelopment: '140',
    minProgress: '4',
    potentialAttributes: [{ key: 'passing', min: '15', max: '' }],
    roles: [
      { role: 'poacher.attack', min: '70' },
      { role: 'winger.support', min: '' },
      { role: '', min: '50' },
    ],
  };
  const filter = toPlayerFilter(fields);
  expect(filter).toMatchObject({
    basedIn: 'Spain',
    minDevelopment: 100,
    minProgress: 4,
    potentialAttributes: [{ key: 'passing', min: 15 }],
    roles: [{ role: 'poacher.attack', min: 70 }],
  });
  expect(countFilters(filter)).toBe(5);
  // Only a column: no filter in effect.
  expect(toPlayerFilter({ ...NO_PLAYER_FILTERS, roles: [{ role: 'winger.support', min: '' }] })).toBeUndefined();
});

test('saved filters keep the scouting fields and drop roles this version does not know', () => {
  const fields = readFields({
    minProgress: '11',
    minDevelopment: '30',
    roles: [{ role: 'anchor.defend', min: '60' }, { role: 'sweeper.attack', min: '1' }],
    potentialAttributes: [{ key: 'pace', min: '16', max: '' }],
  });
  expect(fields.minProgress).toBe('');
  expect(fields.minDevelopment).toBe('30');
  expect(fields.roles).toEqual([{ role: 'anchor.defend', min: '60' }, { role: '', min: '1' }]);
  expect(fields.potentialAttributes).toEqual([{ key: 'pace', min: '16', max: '' }]);
  expect(readOrder({ by: 'role.anchor.defend', ascending: false })).toEqual({ by: 'role.anchor.defend', ascending: false });
  expect(readOrder({ by: 'progress', ascending: true })).toEqual({ by: 'progress', ascending: true });
  expect(readOrder({ by: 'role.nothing.defend', ascending: false })).toBeNull();
  expect(roleLabel('anchor.defend')).toBe('Anchor (Defend)');
  expect(roleShort('ball_playing_defender.defend')).toBe('BPD-D');
});

const DETAILS = {
  uid: 7,
  name: 'Ada Striker',
  positionRatings: { st: 20 },
  attributes: { finishing: { raw: 70, value: 14 }, passing: { raw: 60, value: 12 } },
} as unknown as PlayerDetails;

test('the Scout tab shows the estimates and asks for players like him today or at his peak', async () => {
  const findSimilar = vi.fn();
  render(
    <EditorContext.Provider
      value={{
        editable: false,
        readOnlyNote: '',
        onEdited() {},
        gameActions: NO_GAME_ACTIONS,
        injuryKinds: async () => [],
        gameDate: null,
        openPlayer() {},
        openStaff() {},
        findSimilar,
      }}
    >
      <ScoutTab details={DETAILS} version={0} />
    </EditorContext.Provider>,
  );
  expect(await screen.findByText('62%')).toBeTruthy();
  expect(screen.getByRole('img', { name: '3.5 of 5 stars' })).toBeTruthy();
  expect(screen.getByText('Advanced Forward (Attack)')).toBeTruthy();
  expect(screen.getByText('+3')).toBeTruthy();
  expect(screen.getByText('Alex Morgan, Northbridge Athletic')).toBeTruthy();
  await userEvent.click(screen.getByRole('button', { name: 'At his peak' }));
  expect(findSimilar).toHaveBeenCalledWith({ uid: 7, name: 'Ada Striker' }, true);
});

test('a comparison asks for likeness, shows it, and can be switched to the peak or stopped', async () => {
  calls.length = 0;
  render(<PlayerBrowser version={0} active reveal={null} similar={{ uid: 7, name: 'Ada Striker', peak: false }} />);
  expect(await screen.findByText('Like Ada Striker')).toBeTruthy();
  expect(await screen.findByText('88')).toBeTruthy();
  const searched = () => calls.filter((call) => call.command === 'search_players').at(-1)?.args;
  expect(searched()?.similar).toEqual({ uid: 7, peak: false });
  await userEvent.click(screen.getByRole('button', { name: 'At peak' }));
  await waitFor(() => expect(searched()?.similar).toEqual({ uid: 7, peak: true }));
  await userEvent.click(screen.getByRole('button', { name: 'Stop comparing' }));
  await waitFor(() => expect(searched()?.similar).toBeUndefined());
  expect(screen.queryByText('Like Ada Striker')).toBeNull();
});
