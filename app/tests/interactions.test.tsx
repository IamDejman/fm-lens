import { beforeEach, expect, test, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRef, useState } from 'react';
import { useModal } from '../src/useModal';
import { ListBrowser } from '../src/ListBrowser';
import { Settings } from '../src/Settings';
import { askToLeave, EditorContext, NO_GAME_ACTIONS, useProfileEditing } from '../src/useProfileEditing';
import { saveSnapshot } from '../src/restore';
import { mockInvoke } from '../src/dev/mock';
import { EditButton } from '../src/EditControls';
import { call } from '../src/api';
vi.mock('../src/api', () => ({ inTauri: false, call: vi.fn(), watchCommands: vi.fn() }));
beforeEach(() => { vi.mocked(call).mockImplementation(mockInvoke); });

function ModalHarness() {
  const [open, setOpen] = useState(true);
  const ref = useRef<HTMLDivElement>(null);
  useModal(ref, true, () => setOpen(false));
  return <>{open && <div ref={ref} role="dialog" aria-label="Test modal"><button>First</button><button>Last</button></div>}<button>Behind</button></>;
}
test('modal blocks every section shortcut, traps Tab and closes on Escape', async () => {
  render(<ModalHarness />);
  const behind = vi.fn();
  window.addEventListener('keydown', behind);
  try {
    const dialog = screen.getByRole('dialog');
    for (const key of ['1','2','3','4','5','6','7','8','9','f','s',',']) {
      fireEvent.keyDown(dialog, { key, metaKey: true });
    }
    expect(behind).not.toHaveBeenCalled();
    screen.getByRole('button', { name: 'Last' }).focus();
    await userEvent.tab();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'First' }));
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
  } finally { window.removeEventListener('keydown', behind); }
});

test('a newer search wins even when the earlier request finishes last', async () => {
  const requests: Array<{ query: string; resolve: (page: unknown) => void }> = [];
  vi.mocked(call).mockImplementation((_command, args) => new Promise(resolve => requests.push({ query: String(args?.query), resolve })));
  render(<ListBrowser name="test-list" command="search_test" version={0} active placeholder="Find fixture" summary={n => `${n} matches`} empty={q => `No matches: ${q}`} header={<th>Name</th>} cells={row => <td>{row.uid}</td>} />);
  await waitFor(() => expect(requests).toHaveLength(1));
  await userEvent.type(screen.getByRole('textbox'), 'old');
  await waitFor(() => expect(requests.at(-1)?.query).toBe('old'));
  const old = requests.at(-1)!;
  await userEvent.clear(screen.getByRole('textbox'));
  await userEvent.type(screen.getByRole('textbox'), 'new');
  await waitFor(() => expect(requests.at(-1)?.query).toBe('new'));
  requests.at(-1)!.resolve({ total: 1, rows: [{ uid: 222 }] });
  await screen.findByText('222');
  await act(async () => old.resolve({ total: 1, rows: [{ uid: 111 }] }));
  expect(screen.queryByText('111')).toBeNull();
  expect(screen.getByText('222')).toBeTruthy();
  expect(screen.getByRole('textbox')).toHaveProperty('value', 'new');
});

function PendingHarness() {
  const edit = useProfileEditing('player', 1009102);
  const [view, setView] = useState('Profile');
  return <><button onClick={() => edit.begin()}>Edit fixture</button>
    {edit.session && <input aria-label="Finishing" value={edit.session.input('attribute.finishing')?.text ?? ''} onChange={e => edit.session?.type('attribute.finishing', e.target.value)} />}
    <button onClick={() => askToLeave(() => setView('Other view'))}>Navigate</button>
    <button onClick={edit.done}>Done fixture</button>
    <button onClick={() => edit.guardClose(() => setView('Closed'))}>Close fixture</button>
    <p>{view}</p><p>{edit.confirming ? 'Confirm discard' : ''}</p><button onClick={edit.keepEditing}>Keep editing</button><button onClick={edit.confirmDiscard}>Discard fixture</button></>;
}
function ToggleHarness() {
  const edit = useProfileEditing('player', 1009102);
  return <EditButton editing={edit} ready />;
}
test('the profile toggle reads Done while editing', async () => {
  render(<EditorContext.Provider value={{ editable: true, readOnlyNote: '', onEdited() {}, gameActions: NO_GAME_ACTIONS, injuryKinds: async () => [], gameDate: null, openPlayer() {}, openStaff() {} }}><ToggleHarness /></EditorContext.Provider>);
  const toggle = screen.getByRole('button', { name: 'Edit' });
  expect(toggle.getAttribute('title')).toBe('Edit this profile');
  await userEvent.click(toggle);
  await screen.findByRole('button', { name: 'Done' });
  expect(toggle.hasAttribute('aria-pressed')).toBe(false);
  expect(toggle.hasAttribute('title')).toBe(false);
  await userEvent.click(toggle);
  await screen.findByRole('button', { name: 'Edit' });
});

// Pending-navigation coverage uses the real editor hook and the same fixture command adapter as the preview.
test('pending navigation requires an explicit discard', async () => {
  render(<EditorContext.Provider value={{ editable: true, readOnlyNote: '', onEdited() {}, gameActions: NO_GAME_ACTIONS, injuryKinds: async () => [], gameDate: null, openPlayer() {}, openStaff() {} }}><PendingHarness /></EditorContext.Provider>);
  await userEvent.click(screen.getByRole('button', { name: 'Edit fixture' }));
  await screen.findByRole('textbox', { name: 'Finishing' });
  await userEvent.clear(screen.getByRole('textbox', { name: 'Finishing' }));
  await userEvent.type(screen.getByRole('textbox', { name: 'Finishing' }), '17');
  await userEvent.click(screen.getByRole('button', { name: 'Navigate' }));
  await screen.findByText('Confirm discard');
  expect(screen.queryByText('Other view')).toBeNull();
  await userEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
  expect(screen.getByRole('textbox')).toHaveProperty('value', '17');
  await userEvent.click(screen.getByRole('button', { name: 'Navigate' }));
  await userEvent.click(screen.getByRole('button', { name: 'Discard fixture' }));
  await screen.findByText('Other view');
});

test('settings snapshot records open state for window restoration', async () => {
  const mounted = render(<Settings busy={false} details={<p>Fixture version</p>} onSupport={() => {}} />);
  await userEvent.click(screen.getByRole('button', { name: 'Settings' }));
  expect(within(screen.getByRole('dialog')).getByText('Fixture version')).toBeTruthy();
  saveSnapshot();
  expect(JSON.parse(sessionStorage.getItem('fmlens.restore')!).parts.settings).toBe(true);
  mounted.unmount();
  vi.resetModules();
  const { Settings: RestoredSettings } = await import('../src/Settings');
  render(<RestoredSettings busy={false} details={<p>Restored version</p>} onSupport={() => {}} />);
  expect(within(screen.getByRole('dialog')).getByText('Restored version')).toBeTruthy();
  expect(sessionStorage.getItem('fmlens.restore')).toBeNull();
});


test.each(['Navigate', 'Done fixture', 'Close fixture'])('invalid-only draft is protected by %s', async action => {
  render(<EditorContext.Provider value={{ editable: true, readOnlyNote: '', onEdited() {}, gameActions: NO_GAME_ACTIONS, injuryKinds: async () => [], gameDate: null, openPlayer() {}, openStaff() {} }}><PendingHarness /></EditorContext.Provider>);
  await userEvent.click(screen.getByRole('button', { name: 'Edit fixture' }));
  const input = await screen.findByRole('textbox', { name: 'Finishing' });
  await userEvent.clear(input);
  await userEvent.type(input, '1000');
  await userEvent.click(screen.getByRole('button', { name: action }));
  await screen.findByText('Confirm discard');
  expect(screen.queryByText('Other view')).toBeNull();
  expect(screen.queryByText('Closed')).toBeNull();
  await userEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
  expect(input).toHaveProperty('value', '1000');
  await userEvent.click(screen.getByRole('button', { name: action }));
  await userEvent.click(screen.getByRole('button', { name: 'Discard fixture' }));
  if (action === 'Navigate') await screen.findByText('Other view');
  else if (action === 'Close fixture') await screen.findByText('Closed');
  else expect(screen.queryByRole('textbox', { name: 'Finishing' })).toBeNull();
});
