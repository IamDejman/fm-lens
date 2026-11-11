import { expect, test, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MassEditButton } from '../src/MassEditDialog';
import { EditorContext, NO_GAME_ACTIONS } from '../src/useProfileEditing';

// What the app holds frozen of the 3 players the list selects, how many it refuses to freeze, and what it was asked.
const game = { frozen: 1, refuse: 0, calls: [] as [string, unknown][] };
// The freeze of the mass edit last planned, and of the one last applied.
let planned: { frozen: boolean; count: number } | null = null;
let made: { frozen: boolean; count: number } | null = null;

// The one field the dialog offers.
const FIELD = vi.hoisted(() => ({
  key: 'current_ability',
  entity: 'player',
  kind: 'u8',
  scale: 'plain',
  min: 1,
  max: 200,
  blank: null,
  choices: null,
  mass: true,
}));

vi.mock('../src/dev/mock', () => ({
  mockInvoke: async (command: string, args?: Record<string, unknown>) => {
    game.calls.push([command, args]);
    switch (command) {
      case 'edit_fields':
        return [FIELD];
      case 'frozen_selection':
        return { selected: 3, frozen: game.frozen };
      case 'plan_mass_edit': {
        const frozen = args?.freeze as boolean;
        planned = { frozen, count: frozen ? 3 - game.frozen : game.frozen };
        return { id: 7, targets: 3, unchanged: 0, changes: 0, rows: [], skippedCount: 0, skipped: [], freeze: planned };
      }
      case 'apply_mass_edit': {
        const { frozen, count } = planned!;
        made = { frozen, count: frozen ? count - game.refuse : count };
        game.frozen += frozen ? made.count : -made.count;
        const error = { code: 'freeze.invalid', params: {}, message: 'its value is invalid' };
        const failed = frozen ? game.refuse : 0;
        return { batch: 9, applied: 0, failed: [], freeze: { ...made, failed, error: failed > 0 ? error : null } };
      }
      case 'undo_batch': {
        const { frozen, count } = made!;
        game.frozen += frozen ? -count : count;
        return { undone: 0, failed: [], freeze: { frozen: !frozen, count } };
      }
      default:
        return null;
    }
  },
}));

const asked = (command: string) => game.calls.filter(([name]) => name === command).map(([, args]) => args);

async function openDialog() {
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
        openStaff: () => {},
      }}
    >
      <MassEditButton entity="player" filters={{ playerFilter: {} }} list={{ query: 'arsenal', total: 3, shown: 3 }} />
    </EditorContext.Provider>,
  );
  await userEvent.click(screen.getByRole('button', { name: 'Mass edit' }));
  const box = (await screen.findByRole('checkbox', { name: 'Freeze attributes' })) as HTMLInputElement;
  await screen.findByRole('button', { name: 'Preview' });
  return box;
}

const apply = () => screen.getByRole('button', { name: 'Apply' }) as HTMLButtonElement;

test('ticking the freeze box freezes nothing until Apply, and Undo takes it back', async () => {
  Object.assign(game, { frozen: 1, refuse: 0, calls: [] });
  const box = await openDialog();
  // One of the three is frozen already: neither ticked nor clear, and nothing to apply.
  expect(box.checked).toBe(false);
  expect(box.indeterminate).toBe(true);
  expect(apply().disabled).toBe(true);

  await userEvent.click(box);
  expect(box.checked).toBe(true);
  expect(box.indeterminate).toBe(false);
  expect(screen.getByText('2 to freeze')).toBeTruthy();
  expect(asked('plan_mass_edit')).toHaveLength(0);
  expect(game.frozen).toBe(1);

  await userEvent.click(apply());
  expect(await screen.findByText('2 frozen')).toBeTruthy();
  expect(asked('plan_mass_edit')).toEqual([
    { entity: 'player', query: 'arsenal', filters: { playerFilter: {} }, operations: [], freeze: true },
  ]);
  expect(asked('apply_mass_edit')).toEqual([{ id: 7 }]);
  expect(screen.queryByText('Nothing changed')).toBeNull();
  await waitFor(() => expect(box.checked).toBe(true));
  expect(box.disabled).toBe(true);

  await userEvent.click(screen.getByRole('button', { name: 'Undo this mass edit' }));
  expect(await screen.findByText('2 unfrozen')).toBeTruthy();
  expect(asked('undo_batch')).toEqual([{ batch: 9 }]);
  await waitFor(() => expect(box.indeterminate).toBe(true));
  expect(box.checked).toBe(false);
  expect(screen.queryByRole('button', { name: 'Undo this mass edit' })).toBeNull();
});

test('the box goes from the rest frozen to all unfrozen to left as it is', async () => {
  Object.assign(game, { frozen: 1, refuse: 0, calls: [] });
  const box = await openDialog();
  await userEvent.click(box);
  await userEvent.click(box);
  expect(box.checked).toBe(false);
  expect(box.indeterminate).toBe(false);
  expect(screen.getByText('1 to unfreeze')).toBeTruthy();

  await userEvent.click(box);
  expect(box.indeterminate).toBe(true);
  expect(apply().disabled).toBe(true);
  expect(screen.queryByText('1 to unfreeze')).toBeNull();
});

test('a freeze with a field filled in waits for the preview', async () => {
  Object.assign(game, { frozen: 0, refuse: 0, calls: [] });
  const box = await openDialog();
  await userEvent.click(box);
  await userEvent.type(screen.getByRole('spinbutton'), '150');
  expect(apply().disabled).toBe(true);
  expect(screen.queryByText('3 to freeze')).toBeNull();

  await userEvent.click(screen.getByRole('button', { name: 'Preview' }));
  expect(await screen.findByText('3 to freeze')).toBeTruthy();
  expect(asked('plan_mass_edit')[0]).toMatchObject({ freeze: true, operations: [{ field: 'current_ability' }] });
  expect(apply().disabled).toBe(false);
});

test('what could not be frozen is said, and the box stays in between', async () => {
  Object.assign(game, { frozen: 0, refuse: 1, calls: [] });
  const box = await openDialog();
  await userEvent.click(box);
  await userEvent.click(apply());
  expect(await screen.findByText('2 frozen')).toBeTruthy();
  expect(screen.getByText("1 couldn't be frozen: Its value is invalid")).toBeTruthy();
  await waitFor(() => expect(box.indeterminate).toBe(true));
  expect(box.checked).toBe(false);
});
