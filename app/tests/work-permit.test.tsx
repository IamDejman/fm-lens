import { beforeEach, expect, test, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WorkPermitGroup } from '../src/PlayerProfile';
import { EditorContext, NO_GAME_ACTIONS } from '../src/useProfileEditing';
import { call } from '../src/api';
import type { PlayerDetails } from '../src/types';

vi.mock('../src/api', () => ({ inTauri: false, call: vi.fn(), watchCommands: vi.fn() }));
beforeEach(() => { vi.mocked(call).mockReset(); });
const declined = { code: 'call.declined', params: {}, message: 'the game did not make the change' };
const player: Pick<PlayerDetails, 'uid' | 'club' | 'workPermits'> = { uid: 123, club: 'Arsenal', workPermits: [] };
const edited = vi.fn();
function View({ details = player, editable = true, available = true }) {
  return <EditorContext.Provider value={{ editable, readOnlyNote: 'Read only', onEdited: edited,
    gameActions: { ...NO_GAME_ACTIONS, workPermit: available }, injuryKinds: async () => [], gameDate: null }}>
    <WorkPermitGroup details={details} />
  </EditorContext.Provider>;
}

test('an unissued request is explained without claiming a grant or showing a generic error', async () => {
  edited.mockClear();
  vi.mocked(call).mockRejectedValue(declined);
  const view = render(<View />);
  expect(screen.queryByRole('button', { name: 'Grant' })).toBeNull();
  await userEvent.click(screen.getByRole('button', { name: 'Request permit' }));
  expect(await screen.findByRole('status')).toHaveProperty('textContent',
    'FM did not issue a permit. This player may not need one under the current rules.');
  expect(screen.queryByRole('alert')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Revoke' })).toBeNull();
  expect(call).toHaveBeenCalledWith('set_work_permit', { uid: 123, granted: true });
  expect(edited).toHaveBeenCalledTimes(1);
  view.rerender(<View details={{ ...player, uid: 456 }} />);
  expect(screen.queryByRole('status')).toBeNull();
});

test('successful requests refresh and a returned permit offers Revoke', async () => {
  edited.mockClear();
  vi.mocked(call).mockResolvedValue({});
  const view = render(<View />);
  await userEvent.click(screen.getByRole('button', { name: 'Request permit' }));
  expect(edited).toHaveBeenCalledTimes(1);
  view.rerender(<View details={{ ...player, workPermits: [{ nation: 'England', nationUid: 765, esc: false, escSince: null }] }} />);
  expect(screen.getByRole('button', { name: 'Revoke' })).toHaveProperty('disabled', false);
  expect(screen.getByText('Active')).toBeTruthy();
  vi.mocked(call).mockRejectedValue(declined);
  await userEvent.click(screen.getByRole('button', { name: 'Revoke' }));
  expect(await screen.findByRole('alert')).toHaveProperty('textContent', "FM didn't make the change.");
  expect(screen.queryByRole('status')).toBeNull();
});

test('connection failures remain errors and unavailable/read-only actions stay guarded', async () => {
  vi.mocked(call).mockRejectedValue(new Error('Connection lost'));
  const view = render(<View />);
  await userEvent.click(screen.getByRole('button', { name: 'Request permit' }));
  expect((await screen.findByRole('alert')).textContent).toContain('Connection lost');
  view.rerender(<View editable={false} />);
  expect(screen.getByRole('button', { name: 'Request permit' })).toHaveProperty('disabled', true);
  view.rerender(<View available={false} />);
  expect(screen.queryByRole('button')).toBeNull();
});
