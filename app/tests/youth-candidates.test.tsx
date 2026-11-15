import { beforeEach, expect, test, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SquadTab } from '../src/SquadTab';
import { call } from '../src/api';
import { mockInvoke } from '../src/dev/mock';
import type { ClubTeam, PlayerSummary, SquadPlayer } from '../src/types';
vi.mock('../src/api', () => ({ inTauri: false, call: vi.fn(), watchCommands: vi.fn() }));

const PANEL = { id: 'squad-panel', labelledBy: 'squad-tab' };

/** A club with a senior team, under-18s and the youth candidates team, which has `candidates` players. */
async function teams(candidates: number): Promise<ClubTeam[]> {
  const found = await mockInvoke<{ rows: PlayerSummary[] }>('search_players', { query: '', limit: 3 });
  const row = (player: PlayerSummary): SquadPlayer => ({
    ...player,
    playsHere: true,
    loan: null,
    condition: 10000,
    matchSharpness: 10000,
    jadedness: 0,
    morale: 15,
    injuries: 0,
    bans: 0,
    unhappy: false,
  });
  const [senior, youth, candidate] = found.rows.map(row);
  const team = (index: number, kind: number, ageLimit: number | null, players: SquadPlayer[]): ClubTeam => ({
    index,
    kind,
    ageLimit,
    captain: null,
    viceCaptain: null,
    players,
  });
  return [
    team(0, 0, null, [senior]),
    team(1, 12, 18, [youth]),
    team(2, 22, null, candidates > 0 ? [candidate] : []),
  ];
}

const showSquad = async (candidates: number) => {
  const squads = await teams(candidates);
  vi.mocked(call).mockImplementation(async (command: string, args?: Record<string, unknown>) =>
    command === 'club_squads' ? squads : mockInvoke(command, args),
  );
  render(<SquadTab clubUid={1} version={0} panel={PANEL} />);
  await screen.findByRole('button', { name: 'U18' });
};

beforeEach(() => {
  vi.mocked(call).mockReset();
});

test('the youth candidates team stays out of the switch while the game leaves it empty', async () => {
  await showSquad(0);
  expect(screen.queryByRole('button', { name: 'Youth Candidates' })).toBeNull();
});

test('the youth candidates team shows once it has players', async () => {
  await showSquad(1);
  expect(await screen.findByRole('button', { name: 'Youth Candidates' })).toBeTruthy();
});
