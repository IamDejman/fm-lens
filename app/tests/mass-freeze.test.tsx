import { expect, test, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MassEditButton } from '../src/MassEditDialog';
import { EditorContext, NO_GAME_ACTIONS } from '../src/useProfileEditing';

// What the app holds frozen of the 3 players the list selects, and what it was asked.
const game = { frozen: 1, refuse: 0, calls: [] as unknown[] };

vi.mock('../src/dev/mock', () => ({
  mockInvoke: async (command: string, args?: Record<string, unknown>) => {
    if (command === 'edit_fields') {
      return [];
    }
    if (command === 'freeze_selection') {
      game.calls.push(args);
      game.frozen = args?.frozen ? 3 - game.refuse : 0;
    }
    const error = game.refuse > 0 ? { code: 'freeze.invalid', params: {}, message: 'its value is invalid' } : null;
    return { selected: 3, frozen: game.frozen, error: command === 'freeze_selection' ? error : null };
  },
}));

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
  return (await screen.findByRole('checkbox', { name: 'Freeze attributes' })) as HTMLInputElement;
}

test('the freeze box freezes the rest of the list, then unfreezes all of it', async () => {
  Object.assign(game, { frozen: 1, refuse: 0, calls: [] });
  const box = await openDialog();
  // One of the three is frozen already: neither ticked nor clear.
  expect(box.checked).toBe(false);
  expect(box.indeterminate).toBe(true);

  await userEvent.click(box);
  await waitFor(() => expect(box.checked).toBe(true));
  expect(box.indeterminate).toBe(false);
  expect(game.calls).toEqual([{ entity: 'player', query: 'arsenal', filters: { playerFilter: {} }, frozen: true }]);

  await userEvent.click(box);
  await waitFor(() => expect(box.checked).toBe(false));
  expect(box.indeterminate).toBe(false);
  expect(game.calls).toHaveLength(2);
  expect(game.calls[1]).toMatchObject({ frozen: false });
});

test('what could not be frozen is said, and the box stays in between', async () => {
  Object.assign(game, { frozen: 0, refuse: 1, calls: [] });
  const box = await openDialog();
  await userEvent.click(box);
  expect((await screen.findByRole('alert')).textContent).toBe("1 couldn't be frozen: Its value is invalid");
  expect(box.checked).toBe(false);
  expect(box.indeterminate).toBe(true);
});
