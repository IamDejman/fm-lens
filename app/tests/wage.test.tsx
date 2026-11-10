import { expect, test, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { inputState, judge, summarize } from '../src/editDraft';
import { EditInput } from '../src/EditControls';
import { EditorContext, NO_GAME_ACTIONS, SessionContext, useProfileEditing } from '../src/useProfileEditing';
import type { EditField } from '../src/types';

const wage: EditField = { key: 'contract.wage', entity: 'player', kind: 'i32', scale: 'plain', min: 0,
  max: 10000000, blank: null, choices: null, mass: false };

test.each([250000, 275000, 300000])('£260,000 stays exact when the previous wage is %i', stored => {
  expect(judge(wage, stored, '260000')).toEqual({ status: 'changed', shown: 260000,
    edit: { field: wage.key, expected: stored, value: 260000 } });
  expect(summarize([wage], { [wage.key]: stored }, { [wage.key]: '260000' }).changes[0].edit.value).toBe(260000);
});

test('unchanged, invalid and exact-step wages retain their validation', () => {
  expect(judge(wage, 260000, '260000').status).toBe('same');
  for (const text of ['', '-1', '260000.5', '10000001']) expect(judge(wage, 250000, text).status).toBe('invalid');
  expect(inputState(wage, 250000, '275000', undefined).notice).toBeNull();
});

test('typing and leaving a wage preserves it and exposes its display estimate', async () => {
  function Editor() {
    const [text, setText] = useState('250000');
    return <SessionContext.Provider value={{ entity: 'player', busy: false, has: () => true,
      input: () => inputState(wage, 250000, text, undefined), type: (_key, value) => setText(value) }}>
      <EditInput field={wage.key} hint={false} /><button>Apply</button>
    </SessionContext.Provider>;
  }
  render(<Editor />);
  const input = screen.getByRole('spinbutton');
  await userEvent.clear(input);
  await userEvent.type(input, '260000');
  await userEvent.tab();
  expect(input).toHaveProperty('value', '260000');
  expect(screen.getByRole('status').textContent).toContain('£250,000');
  expect(screen.getByRole('status').textContent).toContain('entered amount will be saved');
  expect(document.getElementById(input.getAttribute('aria-describedby')!)?.textContent).toContain('£250,000');
});


vi.mock('../src/api', () => ({ inTauri: false, call: vi.fn(), watchCommands: vi.fn() }));

test.each(['MacIntel', 'Win32'])('real editor Apply submits £260,000 and rereads it on %s', async platform => {
  Object.defineProperty(navigator, 'platform', { value: platform, configurable: true });
  const { call } = await import('../src/api');
  let stored = 250000;
  vi.mocked(call).mockReset();
  vi.mocked(call).mockImplementation(async (command, args) => {
    if (command === 'edit_fields') return [wage] as never;
    if (command === 'read_values') return { [wage.key]: stored } as never;
    if (command === 'apply_edits') {
      const edits = args?.edits as Array<{ value: number }>;
      stored = edits[0].value;
      return { applied: [{ field: wage.key, old: 250000, new: stored }], failed: [] } as never;
    }
    return [] as never;
  });
  function Editor() {
    const edit = useProfileEditing('player', 123);
    return <><button onClick={() => edit.begin()}>Edit wage</button>
      <SessionContext.Provider value={edit.session}><EditInput field={wage.key} /></SessionContext.Provider>
      <button onClick={edit.apply}>Apply wage</button>
      <p>{edit.report?.applied === 1 ? 'Applied exact wage' : ''}</p></>;
  }
  render(<EditorContext.Provider value={{ editable: true, readOnlyNote: '', onEdited() {},
    gameActions: NO_GAME_ACTIONS, injuryKinds: async () => [], gameDate: null, openPlayer() {} }}><Editor /></EditorContext.Provider>);
  await userEvent.click(screen.getByRole('button', { name: 'Edit wage' }));
  const input = await screen.findByRole('spinbutton');
  await userEvent.clear(input);
  await userEvent.type(input, '260000');
  await userEvent.click(screen.getByRole('button', { name: 'Apply wage' }));
  await waitFor(() => expect(call).toHaveBeenCalledWith('apply_edits', { entity: 'player', uid: 123,
    edits: [{ field: wage.key, expected: 250000, value: 260000 }] }));
  await screen.findByText('Applied exact wage');
  expect(stored).toBe(260000);
  expect(call).toHaveBeenLastCalledWith('read_values', { entity: 'player', uid: 123 });
});

test('the profile shows the figure FM shows under a wage FM rounds, and nothing under one it shows as is', async () => {
  const { WageFact } = await import('../src/ProfileParts');
  const { rerender } = render(<WageFact wage={260000} />);
  expect(screen.getByText('£260,000')).toBeTruthy();
  expect(screen.getByText('FM shows £250,000')).toBeTruthy();
  rerender(<WageFact wage={250000} />);
  expect(screen.queryByText(/FM shows/)).toBeNull();
});

test('the wage input keeps its own notice and drops the shown figure while editing', async () => {
  const { WageFact } = await import('../src/ProfileParts');
  render(<SessionContext.Provider value={{ entity: 'player', busy: false, has: () => true,
    input: () => inputState(wage, 260000, undefined, undefined), type: () => {} }}>
    <WageFact wage={260000} />
  </SessionContext.Provider>);
  expect(screen.getByRole('spinbutton')).toHaveProperty('value', '260000');
  expect(screen.queryByText(/FM shows/)).toBeNull();
});
