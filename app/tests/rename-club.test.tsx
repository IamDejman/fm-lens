import { beforeEach, expect, test, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RenameButton } from '../src/RenameClub';
import { EditorContext, NO_GAME_ACTIONS } from '../src/useProfileEditing';
import { call } from '../src/api';
import { openUrl } from '@tauri-apps/plugin-opener';

vi.mock('../src/api', () => ({ inTauri: false, call: vi.fn(), watchCommands: vi.fn() }));
vi.mock('@tauri-apps/plugin-opener', () => ({ openUrl: vi.fn(async () => {}) }));
beforeEach(() => { vi.mocked(call).mockReset().mockResolvedValue(null); edited.mockClear(); });
const edited = vi.fn();
const club = { uid: 500, name: 'Burntisland Shipyard', shortName: 'Burntisland' as string | null };
function View({ named = club }) {
  return <EditorContext.Provider value={{ editable: true, readOnlyNote: 'Read only', onEdited: edited,
    gameActions: { ...NO_GAME_ACTIONS, renameClub: true }, injuryKinds: async () => [], gameDate: null, openPlayer() {}, openStaff() {}, findSimilar() {} }}>
    <RenameButton club={named} />
  </EditorContext.Provider>;
}
const open = async () => {
  await userEvent.click(screen.getByRole('button', { name: 'Rename' }));
  return screen.getByRole('dialog', { name: 'Rename club' });
};
const type = async (label: string, text: string) => {
  const input = screen.getByLabelText(label);
  await userEvent.clear(input);
  if (text) await userEvent.type(input, text);
};
const submit = () => screen.getAllByRole('button', { name: 'Rename' }).find((b) => b.getAttribute('type') === 'submit') as HTMLButtonElement;

test('the dialog opens with the names the club has, and nothing to send', async () => {
  render(<View />);
  await open();
  expect(screen.getByLabelText('Name')).toHaveProperty('value', 'Burntisland Shipyard');
  expect(screen.getByLabelText('Short name')).toHaveProperty('value', 'Burntisland');
  expect(submit().disabled).toBe(true);
});

test('only the name that changed is sent, and the lists are read again', async () => {
  vi.mocked(call).mockResolvedValue({});
  render(<View />);
  await open();
  await type('Name', ' Methil Rovers ');
  await userEvent.click(submit());
  expect(call).toHaveBeenCalledWith('rename_club', { uid: 500, name: 'Methil Rovers', shortName: null });
  expect(edited).toHaveBeenCalledOnce();
  expect(screen.queryByRole('dialog')).toBeNull();
});

test('both names are sent when both changed', async () => {
  vi.mocked(call).mockResolvedValue({});
  render(<View />);
  await open();
  await type('Name', 'Methil Rovers');
  await type('Short name', 'Methil');
  await userEvent.click(submit());
  expect(call).toHaveBeenCalledWith('rename_club', { uid: 500, name: 'Methil Rovers', shortName: 'Methil' });
});

test('an empty name cannot be sent', async () => {
  render(<View />);
  await open();
  await type('Name', '   ');
  expect(submit().disabled).toBe(true);
  expect(call).not.toHaveBeenCalledWith('rename_club', expect.anything());
});

test('a club without a short name is asked for its name only', async () => {
  render(<View named={{ ...club, shortName: null }} />);
  await open();
  expect(screen.queryByLabelText('Short name')).toBeNull();
});

test('a rename the game refused is said in the dialog, which stays open', async () => {
  vi.mocked(call).mockRejectedValue({ code: 'club.sameName', params: {}, message: 'the club has that name already' });
  render(<View />);
  await open();
  await type('Name', 'Methil Rovers');
  await userEvent.click(submit());
  expect((await screen.findByRole('alert')).textContent).toBe('The club has that name already.');
  expect(edited).not.toHaveBeenCalled();
  expect(screen.getByRole('dialog')).toBeTruthy();
});

test('when macOS keeps FM Lens out of FM\'s folder, a button opens App Management', async () => {
  vi.mocked(call).mockRejectedValue({ code: 'club.nameFileBlocked', params: {}, message: 'blocked' });
  render(<View />);
  await open();
  await type('Name', 'Methil Rovers');
  await userEvent.click(submit());
  expect((await screen.findByRole('alert')).textContent).toContain('Allow FM Lens in App Management, then try again.');
  await userEvent.click(screen.getByRole('button', { name: 'Open App Management' }));
  expect(openUrl).toHaveBeenCalledWith('x-apple.systempreferences:com.apple.preference.security?Privacy_AppBundles');
  expect(edited).not.toHaveBeenCalled();
});

test('another failure has no settings button', async () => {
  vi.mocked(call).mockRejectedValue({ code: 'club.nameFile', params: {}, message: 'not written' });
  render(<View />);
  await open();
  await type('Name', 'Methil Rovers');
  await userEvent.click(submit());
  await screen.findByRole('alert');
  expect(screen.queryByRole('button', { name: 'Open App Management' })).toBeNull();
});

test('a club the file renamed can be given the names the game gives it back', async () => {
  const kept = { ...club, name: 'Leven Athletic', shortName: 'Leven' };
  vi.mocked(call).mockImplementation(async (command: string) =>
    (command === 'game_club_names' ? { name: 'Burntisland Shipyard', shortName: 'Burntisland' } : {}) as never);
  render(<View named={kept} />);
  await open();
  await userEvent.click(await screen.findByRole('button', { name: 'Use original names' }));
  expect(screen.getByLabelText('Name')).toHaveProperty('value', 'Burntisland Shipyard');
  expect(screen.getByLabelText('Short name')).toHaveProperty('value', 'Burntisland');
  expect(screen.queryByRole('button', { name: 'Use original names' })).toBeNull();
  await userEvent.click(submit());
  expect(call).toHaveBeenCalledWith('rename_club', { uid: 500, name: 'Burntisland Shipyard', shortName: 'Burntisland' });
});

test('a club the file does not rename has no button for its original names', async () => {
  render(<View />);
  await open();
  expect(call).toHaveBeenCalledWith('game_club_names', { uid: 500 });
  expect(screen.queryByRole('button', { name: 'Use original names' })).toBeNull();
});
